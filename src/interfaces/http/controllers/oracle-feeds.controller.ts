import { NextFunction, Request, Response, Router } from 'express';
import { L402Service } from '../../../application/services/l402.service.js';
import { OracleFeedsService } from '../../../application/services/oracle-feeds.service.js';
import {
  GasPulseQuerySchema,
  StablecoinQuerySchema,
  WhaleTapeQuerySchema,
  type EvmGasChain,
  type StablecoinSymbol,
} from '../../../domain/schemas/oracle-feeds.schema.js';
import { createL402Middleware, DUAL_RAIL_CORS_HEADERS } from '../middleware/l402.middleware.js';

function validateStablecoinQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = StablecoinQuerySchema.safeParse({ symbol: req.query.symbol });
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid symbol query parameter. Supported stablecoins: USDC, USDT, USDE, DAI.',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  res.locals.validatedStablecoin = parsed.data.symbol;
  next();
}

function validateGasPulseQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = GasPulseQuerySchema.safeParse({ chain: req.query.chain });
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid chain query parameter. Supported chains: ethereum, base, arbitrum.',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  res.locals.validatedGasChain = parsed.data.chain;
  next();
}

function validateWhaleTapeQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = WhaleTapeQuerySchema.safeParse({
    minBtc: req.query.minBtc,
    limit: req.query.limit,
  });
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid whale-tape query parameters. Use minBtc (1..10000) and limit (1..100).',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  res.locals.validatedMinBtc = parsed.data.minBtc;
  res.locals.validatedLimit = parsed.data.limit;
  next();
}

function requireFreshStablecoins(service: OracleFeedsService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const symbol = res.locals.validatedStablecoin as StablecoinSymbol | undefined;
    const snap = service.getStablecoinPeg(symbol);
    if (snap.activeAssetsCount === 0) {
      res.setHeader('Retry-After', '3');
      res.status(503).json({ error: 'Stablecoin peg feeds warming up', retryAfterSec: 3 });
      return;
    }
    next();
  };
}

function requireFreshGasPulse(service: OracleFeedsService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const chain = res.locals.validatedGasChain as EvmGasChain | undefined;
    const snap = service.getGasPulse(chain);
    if (snap.activeChainsCount === 0) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ error: 'EVM gas pulse WebSockets warming up', retryAfterSec: 5 });
      return;
    }
    next();
  };
}

function requireFreshWhaleTape(service: OracleFeedsService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const snap = service.getWhaleTape();
    if (!snap.zmqConnected && snap.totalRawTxSeen === 0) {
      res.setHeader('Retry-After', '3');
      res.status(503).json({ error: 'Bitcoin Core ZMQ rawtx stream connecting', retryAfterSec: 3 });
      return;
    }
    next();
  };
}

function attachDualRailCors(req: Request, res: Response, next: NextFunction): void {
  for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
    res.setHeader(k, v);
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

export function createOracleFeedsRouter(
  oracleFeedsService: OracleFeedsService,
  l402Service: L402Service,
): Router {
  const router = Router();

  router.use('/v1/intel/stablecoin-peg', attachDualRailCors);
  router.use('/v1/chain/evm/gas-pulse', attachDualRailCors);
  router.use('/v1/chain/btc/whale-tape', attachDualRailCors);

  // Zero-wait RAM Stablecoin Peg & Depeg Risk Oracle (1 sat / $0.001 USDC)
  router.get(
    '/v1/intel/stablecoin-peg',
    validateStablecoinQuery,
    requireFreshStablecoins(oracleFeedsService),
    createL402Middleware(l402Service, {
      priceSats: 1,
      priceUsdcAtomic: '1000',
      priceUsdDisplay: '$0.001',
      resourceName: 'stablecoin-peg-oracle',
      description:
        'Zero-wait multi-venue USD peg oracle for USDC, USDT, USDe and DAI with signed bps deviation and depegRiskScore (0-100).',
      schema: {
        input: { query: { symbol: 'Optional stablecoin filter: USDC | USDT | USDE | DAI' } },
        output: { description: 'In-memory USD peg deviation and depeg risk snapshot' },
      },
    }),
    (req: Request, res: Response) => {
      const symbol = res.locals.validatedStablecoin as StablecoinSymbol | undefined;
      res.json({
        source: 'sovereign-intel:ws-ring (Kraken + Coinbase + Binance)',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Cryptographic Multi-Rail Access',
        data: oracleFeedsService.getStablecoinPeg(symbol),
      });
    },
  );

  // Zero-wait EVM Multi-Chain Gas & Blob Base Fee Pulse (1 sat / $0.001 USDC)
  router.get(
    '/v1/chain/evm/gas-pulse',
    validateGasPulseQuery,
    requireFreshGasPulse(oracleFeedsService),
    createL402Middleware(l402Service, {
      priceSats: 1,
      priceUsdcAtomic: '1000',
      priceUsdDisplay: '$0.001',
      resourceName: 'evm-gas-pulse',
      description:
        'Live WebSocket newHeads gas pulse across Ethereum, Base and Arbitrum: baseFeeGwei, EIP-4844 blobBaseFeeGwei, block utilization and 12-block trend.',
      schema: {
        input: { query: { chain: 'Optional chain filter: ethereum | base | arbitrum' } },
        output: { description: 'Zero-wait multi-chain EVM baseFee & blobBaseFee pulse' },
      },
    }),
    (req: Request, res: Response) => {
      const chain = res.locals.validatedGasChain as EvmGasChain | undefined;
      res.json({
        source: 'sovereign-evm:ws-newHeads (Ethereum + Base + Arbitrum)',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Cryptographic Multi-Rail Access',
        data: oracleFeedsService.getGasPulse(chain),
      });
    },
  );

  // Zero-wait Bare-Metal Bitcoin Core ZMQ rawtx Whale Tape (5 sats / $0.005 USDC)
  router.get(
    '/v1/chain/btc/whale-tape',
    validateWhaleTapeQuery,
    requireFreshWhaleTape(oracleFeedsService),
    createL402Middleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceUsdDisplay: '$0.005',
      resourceName: 'btc-zmq-whale-tape',
      description:
        'Real-time bare-metal Bitcoin Core v31.1 ZMQ rawtx mempool stream capturing large unconfirmed transactions (>= minBtc, default 10 BTC) over 24h rolling window.',
      schema: {
        input: {
          query: {
            minBtc: 'Minimum total output BTC filter (1..10000, default 10)',
            limit: 'Max whale events returned (1..100, default 25)',
          },
        },
        output: { description: 'Live ZMQ rawtx whale transaction tape' },
      },
    }),
    (req: Request, res: Response) => {
      const minBtc = res.locals.validatedMinBtc as number;
      const limit = res.locals.validatedLimit as number;
      res.json({
        source: 'sovereign-bitcoind:31.1-zmq-rawtx',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Bare-Metal ZMQ Mempool Stream',
        data: oracleFeedsService.getWhaleTape(minBtc, limit),
      });
    },
  );

  return router;
}
