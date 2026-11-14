import { Router, Request, Response, NextFunction } from 'express';
import { NodeTruthService } from '../../../application/services/node-truth.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import {
  createL402Middleware,
  DUAL_RAIL_CORS_HEADERS,
} from '../middleware/l402.middleware.js';
import { renderEngineDashboardHtml } from '../views/engine-dashboard.view.js';
import {
  renderLlmsTxt,
  renderOpenApiSpec,
  renderMcpConfigJson,
} from '../views/discovery-specs.view.js';

function validateTxidParam(req: Request, res: Response, next: NextFunction): void {
  const rawTxid = req.params.txid;
  if (typeof rawTxid !== 'string' || !/^[0-9a-fA-F]{64}$/.test(rawTxid)) {
    res.status(400).json({ error: 'Invalid 64-character hex transaction ID' });
    return;
  }
  next();
}

function validateOptionalTxid(req: Request, res: Response, next: NextFunction): void {
  const rawParam = req.params.txid !== undefined ? req.params.txid : req.query.txid;
  if (rawParam !== undefined && (typeof rawParam !== 'string' || !/^[0-9a-fA-F]{64}$/.test(rawParam))) {
    res.status(400).json({ error: 'Invalid optional 64-character hex transaction ID' });
    return;
  }
  next();
}

function validateRawTxHexBody(req: Request, res: Response, next: NextFunction): void {
  const rawTxHex = req.body?.rawTxHex;
  if (
    typeof rawTxHex !== 'string' ||
    !/^[0-9a-fA-F]{100,200000}$/.test(rawTxHex) ||
    rawTxHex.length % 2 !== 0
  ) {
    res.status(400).json({
      error: 'Invalid rawTxHex in request body. Must be an even-length hex string (100-200000 chars).',
    });
    return;
  }
  next();
}

export function createNodeTruthRouter(
  nodeTruthService: NodeTruthService,
  l402Service: L402Service
): Router {
  const router = Router();

  // Global CORS & OPTIONS preflight for Dual-Rail (L402 + x402) clients
  router.use((req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Root Dashboard / Discovery
  router.get('/', (req: Request, res: Response): void => {
    if (req.accepts('html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderEngineDashboardHtml());
      return;
    }
    res.json({
      service: 'Sovereign Node Engine',
      version: '1.0.0',
      network: 'bitcoin-mainnet',
      protocol: 'Dual-Rail (L402 Lightning + x402 Base USDC)',
      endpoints: [
        {
          path: '/v1/chain/btc/fees',
          alias: '/v1/truth/fees',
          method: 'GET',
          priceSats: 1,
          priceUsd: '$0.001',
          desc: 'Smart Fee Projections (Bitcoin Core v31.1)',
        },
        {
          path: '/v1/chain/btc/mempool',
          alias: '/v1/truth/mempool',
          method: 'GET',
          priceSats: 2,
          priceUsd: '$0.002',
          desc: 'Deep Mempool Entropy & Congestion Oracle',
        },
        {
          path: '/v1/chain/btc/rbf-shield/:txid',
          alias: '/v1/truth/rbf-shield/:txid',
          method: 'GET',
          priceSats: 5,
          priceUsd: '$0.005',
          desc: '0-Conf BIP-125 RBF Double-Spend Fraud Shield',
        },
        {
          path: '/v1/chain/btc/next-block-xray',
          alias: '/v1/truth/next-block-xray',
          method: 'GET',
          priceSats: 3,
          priceUsd: '$0.003',
          desc: 'Live Miner Candidate Block Template X-Ray & Queue Rank Oracle',
        },
        {
          path: '/v1/chain/btc/simulate-tx',
          alias: '/v1/truth/simulate-tx',
          method: 'POST',
          priceSats: 5,
          priceUsd: '$0.005',
          desc: 'Zero-Broadcast Bitcoin Core v31.1 Consensus & Script Dry-Run Simulator',
        },
        {
          path: '/v1/chain/btc/block',
          alias: '/v1/truth/block',
          method: 'GET',
          priceSats: 1,
          priceUsd: '$0.001',
          desc: 'Block Header Truth',
        },
        {
          path: '/health',
          method: 'GET',
          priceSats: 0,
          priceUsd: '$0.00',
          desc: 'Public Health Check',
        },
      ],
      documentation: 'https://node.sovroute.com/llms.txt',
      openApiSpec: 'https://node.sovroute.com/openapi.json',
      mcpConfig: 'https://node.sovroute.com/mcp-config.json',
    });
    return;
  });

  // Public Machine-Readable Discovery Endpoints (Free / 0 sats)
  router.get('/llms.txt', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(renderLlmsTxt());
  });

  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(renderOpenApiSpec());
  });

  router.get('/mcp-config.json', (_req: Request, res: Response) => {
    res.json(renderMcpConfigJson());
  });

  // Public Health endpoint
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'UP',
      service: 'Sovereign Node Intelligence Engine',
      protocol: 'Dual-Rail (L402 + x402)',
      nodeSynced: true,
      timestamp: Math.floor(Date.now() / 1000),
    });
  });

  // Protected: Mempool Entropy Signal (2 sats / $0.002 USDC)
  router.get(
    ['/v1/chain/btc/mempool', '/v1/truth/mempool'],
    createL402Middleware(l402Service, {
      priceSats: 2,
      priceUsdcAtomic: '2000',
      priceUsdDisplay: '$0.002',
      resourceName: 'mempool-entropy',
      description:
        'Deep Bitcoin mempool entropy: unconfirmed tx count, vMB block backlog, fee pool in sats, and dynamic congestion rating from bare-metal Bitcoin Core v31.1.',
    }),
    async (req: Request, res: Response) => {
      try {
        const mempoolData = await nodeTruthService.getMempoolEntropy();
        res.json({
          source: 'sovereign-bitcoind:31.1 (Mainnet)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          verification: 'Cryptographic Dual-Rail Access',
          data: mempoolData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Mempool Query Failed', details: err.message });
      }
    }
  );

  // Protected: Smart Fee Projection (1 sat / $0.001 USDC)
  router.get(
    ['/v1/chain/btc/fees', '/v1/truth/fees'],
    createL402Middleware(l402Service, {
      priceSats: 1,
      priceUsdcAtomic: '1000',
      priceUsdDisplay: '$0.001',
      resourceName: 'smart-fees',
      description:
        'Real-time Bitcoin Core v31.1 estimatesmartfee projections (sat/vB) for fastest (1-2 blocks) and economic (6 blocks) targets.',
    }),
    async (req: Request, res: Response) => {
      try {
        const feeData = await nodeTruthService.getSmartFeeEstimates();
        res.json({
          source: 'sovereign-bitcoind:31.1 (estimatesmartfee Mainnet Engine)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          verification: 'Cryptographic Dual-Rail Access',
          data: feeData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Smart Fee Query Failed', details: err.message });
      }
    }
  );

  // Protected: 0-Conf RBF Double-Spend Shield (5 sats / $0.005 USDC)
  router.get(
    ['/v1/chain/btc/rbf-shield/:txid', '/v1/truth/rbf-shield/:txid'],
    validateTxidParam,
    createL402Middleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceUsdDisplay: '$0.005',
      resourceName: 'rbf-shield',
      description:
        '0-Conf Bitcoin RBF double-spend fraud oracle: inspects BIP-125 signaling, conflicting spends, ancestor package fee rate, and UTXO confirmation status.',
    }),
    async (req: Request, res: Response) => {
      const rawTxid = req.params.txid;
      const txid = Array.isArray(rawTxid) ? rawTxid[0] : rawTxid;

      try {
        const shieldData = await nodeTruthService.checkRbfShield(txid);
        res.json({
          source: 'sovereign-bitcoind:31.1 (Full-RBF Mempool Inspector)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          verification: 'Cryptographic Dual-Rail Access',
          data: shieldData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'RBF Shield Query Failed', details: err.message });
      }
    }
  );

  // Protected: Block Header Truth (1 sat / $0.001 USDC)
  router.get(
    ['/v1/chain/btc/block', '/v1/truth/block'],
    createL402Middleware(l402Service, {
      priceSats: 1,
      priceUsdcAtomic: '1000',
      priceUsdDisplay: '$0.001',
      resourceName: 'block-header-truth',
      description:
        'Verified Bitcoin mainnet chain tip height, block hash, difficulty, and timestamp from bare-metal Bitcoin Core v31.1.',
    }),
    async (req: Request, res: Response) => {
      try {
        const blockData = await nodeTruthService.getLatestBlockHeader();
        res.json({
          source: 'sovereign-bitcoind:31.1 (Mainnet)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          verification: 'Cryptographic Dual-Rail Access',
          data: blockData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Block Header Query Failed', details: err.message });
      }
    }
  );

  // Protected: Lightning Topology Signal (5 sats / $0.005 USDC)
  router.get(
    ['/v1/chain/btc/topology', '/v1/truth/topology'],
    createL402Middleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceUsdDisplay: '$0.005',
      resourceName: 'lightning-topology',
      description: 'Sovereign Lightning Network node routing & gossip topology intelligence.',
    }),
    async (req: Request, res: Response) => {
      try {
        const topologyData = await nodeTruthService.getLightningTopology();
        res.json({
          source: 'sovereign-lnd:0.21.3 (Mainnet)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          verification: 'Cryptographic Dual-Rail Access',
          data: topologyData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Topology Query Failed', details: err.message });
      }
    }
  );

  // Protected: Live Miner Candidate Block Template X-Ray (3 sats / $0.003 USDC)
  router.get(
    [
      '/v1/chain/btc/next-block-xray',
      '/v1/chain/btc/next-block-xray/:txid',
      '/v1/truth/next-block-xray',
      '/v1/truth/next-block-xray/:txid',
    ],
    validateOptionalTxid,
    createL402Middleware(l402Service, {
      priceSats: 3,
      priceUsdcAtomic: '3000',
      priceUsdDisplay: '$0.003',
      resourceName: 'next-block-xray',
      description:
        'Live Bitcoin Core v31.1 getblocktemplate X-Ray: exact candidate block cutoff fee rate, total fees, whale transactions, and exact queue rank for any txid.',
    }),
    async (req: Request, res: Response) => {
      const rawParam = req.params.txid || (req.query.txid as string | undefined);
      const txid = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      try {
        const xrayData = await nodeTruthService.getNextBlockXray(txid);
        res.json({
          source: 'sovereign-bitcoind:31.1 (getblocktemplate Candidate Block Engine)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          verification: 'Cryptographic Dual-Rail Access',
          data: xrayData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Next Block X-Ray Query Failed', details: err.message });
      }
    }
  );

  // Protected: Zero-Broadcast Consensus & Script Dry-Run Simulator (5 sats / $0.005 USDC)
  router.post(
    ['/v1/chain/btc/simulate-tx', '/v1/truth/simulate-tx'],
    validateRawTxHexBody,
    createL402Middleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceUsdDisplay: '$0.005',
      resourceName: 'simulate-tx-consensus',
      description:
        'Zero-Broadcast Bitcoin Core v31.1 testmempoolaccept consensus & script dry-run simulator. Never broadcasts to P2P network.',
    }),
    async (req: Request, res: Response) => {
      try {
        const simData = await nodeTruthService.simulateTxConsensus(req.body.rawTxHex);
        res.json({
          source: 'sovereign-bitcoind:31.1 (testmempoolaccept Zero-Broadcast Engine)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          verification: 'Cryptographic Dual-Rail Access',
          data: simData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Transaction Simulation Failed', details: err.message });
      }
    }
  );

  return router;
}
