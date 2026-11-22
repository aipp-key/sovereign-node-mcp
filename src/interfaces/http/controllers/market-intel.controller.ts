import { NextFunction, Request, Response, Router } from 'express';
import { MarketIntelService } from '../../../application/services/market-intel.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import {
  MicrostructureQuerySchema,
  OptionsSkewQuerySchema,
  PolymarketEdgeQuerySchema,
  type OptionsAsset,
  type SupportedSymbol,
} from '../../../domain/schemas/market-intel.schema.js';
import { createL402Middleware, DUAL_RAIL_CORS_HEADERS } from '../middleware/l402.middleware.js';

function validateMicrostructureQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = MicrostructureQuerySchema.safeParse({ symbol: req.query.symbol });
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid symbol query parameter. Supported symbols: BTC, ETH, SOL.',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  res.locals.validatedSymbol = parsed.data.symbol;
  next();
}

function validatePolymarketQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = PolymarketEdgeQuerySchema.safeParse({ asset: req.query.asset });
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid asset query parameter. Supported assets: BTC, ETH, SOL.',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  res.locals.validatedAsset = parsed.data.asset;
  next();
}

function validateOptionsQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = OptionsSkewQuerySchema.safeParse({ asset: req.query.asset });
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid asset query parameter. Supported options assets: BTC, ETH.',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  res.locals.validatedOptionsAsset = parsed.data.asset;
  next();
}

function requireFreshFundingArb(marketIntelService: MarketIntelService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const symbol = res.locals.validatedSymbol as SupportedSymbol;
    const snap = marketIntelService.getFundingArb(symbol);
    if (snap.venues.length < 2) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({
        error: 'Funding arbitrage feed warming up or degraded',
        retryAfterSec: 5,
        sourcesActive: snap.sourcesActive,
      });
      return;
    }
    next();
  };
}

function requireFreshOptions(marketIntelService: MarketIntelService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const asset = res.locals.validatedOptionsAsset as OptionsAsset;
    const snap = marketIntelService.getOptionsSkew(asset);
    if (snap.dvol === null) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({
        error: 'Deribit options volatility feed warming up',
        retryAfterSec: 5,
        wsConnected: snap.wsConnected,
      });
      return;
    }
    next();
  };
}

function requireFreshMicrostructure(marketIntelService: MarketIntelService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const symbol = res.locals.validatedSymbol as SupportedSymbol;
    const snap = marketIntelService.getMicrostructure(symbol);
    if (snap.sourcesActive.length < 2) {
      res.setHeader('Retry-After', '3');
      res.status(503).json({
        error: 'Market microstructure feed warming up or degraded',
        retryAfterSec: 3,
        sourcesActive: snap.sourcesActive,
      });
      return;
    }
    next();
  };
}

function requireFreshPolymarket(marketIntelService: MarketIntelService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const asset = res.locals.validatedAsset as SupportedSymbol | undefined;
    const snap = marketIntelService.getPolymarketEdge(asset);
    if (snap.trackedMarketsCount === 0) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({
        error: 'Polymarket feed warming up or unavailable',
        retryAfterSec: 5,
        wsConnected: snap.wsConnected,
      });
      return;
    }
    next();
  };
}

export function createMarketIntelRouter(
  marketIntelService: MarketIntelService,
  l402Service: L402Service,
): Router {
  const router = Router();

  router.use('/v1/intel', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Zero-wait RAM snapshot across Binance, Bybit, OKX, Hyperliquid (3 sats / $0.003 USDC)
  router.get(
    '/v1/intel/microstructure',
    validateMicrostructureQuery,
    requireFreshMicrostructure(marketIntelService),
    createL402Middleware(l402Service, {
      priceSats: 3,
      priceUsdcAtomic: '3000',
      priceUsdDisplay: '$0.003',
      resourceName: 'cross-exchange-microstructure',
      description:
        'Live in-memory microstructure across Binance, Bybit, OKX and Hyperliquid: orderbook imbalance, cross-exchange spread (bps), 1m/5m CVD, funding and liquidation cascade score.',
      schema: {
        input: {
          query: {
            symbol: 'Optional symbol: BTC | ETH | SOL (defaults to BTC)',
          },
        },
        output: {
          description: 'Zero-wait in-memory cross-exchange microstructure snapshot',
        },
      },
    }),
    (req: Request, res: Response) => {
      const symbol = res.locals.validatedSymbol as SupportedSymbol;
      const data = marketIntelService.getMicrostructure(symbol);
      res.json({
        source: 'sovereign-intel:ws-ring (Binance + Bybit + OKX + Hyperliquid)',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Cryptographic Multi-Rail Access',
        data,
      });
    },
  );

  // Zero-wait RAM Polymarket CLOB + Gamma paired with live exchange spot price (4 sats / $0.004 USDC)
  router.get(
    '/v1/intel/polymarket-edge',
    validatePolymarketQuery,
    requireFreshPolymarket(marketIntelService),
    createL402Middleware(l402Service, {
      priceSats: 4,
      priceUsdcAtomic: '4000',
      priceUsdDisplay: '$0.004',
      resourceName: 'polymarket-spot-edge',
      description:
        'Live Polymarket CLOB orderbook probability and depth paired with real-time 4-exchange spot price and orderbook imbalance.',
      schema: {
        input: {
          query: {
            asset: 'Optional asset filter: BTC | ETH | SOL',
          },
        },
        output: {
          description: 'Live Polymarket probability and cross-exchange spot reference snapshot',
        },
      },
    }),
    (req: Request, res: Response) => {
      const asset = res.locals.validatedAsset as SupportedSymbol | undefined;
      const data = marketIntelService.getPolymarketEdge(asset);
      res.json({
        source: 'sovereign-intel:polymarket-clob + exchange-ws',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Cryptographic Multi-Rail Access',
        data,
      });
    },
  );

  // Zero-wait RAM Cross-Exchange Funding & Spot-Perp Basis Arbitrage (3 sats / $0.003 USDC)
  router.get(
    '/v1/intel/funding-arb',
    validateMicrostructureQuery,
    requireFreshFundingArb(marketIntelService),
    createL402Middleware(l402Service, {
      priceSats: 3,
      priceUsdcAtomic: '3000',
      priceUsdDisplay: '$0.003',
      resourceName: 'funding-basis-arb',
      description:
        'Cross-exchange funding rate carry and Binance spot-to-perp basis (bps + annualized APR) across Binance, Bybit and OKX.',
      schema: {
        input: { query: { symbol: 'Optional symbol: BTC | ETH | SOL (defaults to BTC)' } },
        output: { description: 'In-memory carry and spot-perp basis snapshot' },
      },
    }),
    (req: Request, res: Response) => {
      const symbol = res.locals.validatedSymbol as SupportedSymbol;
      const data = marketIntelService.getFundingArb(symbol);
      res.json({
        source: 'sovereign-intel:funding-basis-arb',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Cryptographic Multi-Rail Access',
        data,
      });
    },
  );

  // Zero-wait RAM Deribit DVOL + 25-Delta Options Skew Oracle (4 sats / $0.004 USDC)
  router.get(
    '/v1/intel/options-skew',
    validateOptionsQuery,
    requireFreshOptions(marketIntelService),
    createL402Middleware(l402Service, {
      priceSats: 4,
      priceUsdcAtomic: '4000',
      priceUsdDisplay: '$0.004',
      resourceName: 'deribit-options-skew',
      description:
        'Live Deribit DVOL volatility index, market regime (CALM/ELEVATED/PANIC), ATM IV, OTM put-call skew and options OI ratio.',
      schema: {
        input: { query: { asset: 'Optional options asset: BTC | ETH (defaults to BTC)' } },
        output: { description: 'In-memory Deribit DVOL and options skew snapshot' },
      },
    }),
    (req: Request, res: Response) => {
      const asset = res.locals.validatedOptionsAsset as OptionsAsset;
      const data = marketIntelService.getOptionsSkew(asset);
      res.json({
        source: 'sovereign-intel:deribit-dvol + option-chain',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Cryptographic Multi-Rail Access',
        data,
      });
    },
  );

  return router;
}
