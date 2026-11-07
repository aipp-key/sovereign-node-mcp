import { Router, Request, Response, NextFunction } from 'express';
import { NodeTruthService } from '../../../application/services/node-truth.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import {
  createOmniRailMiddleware,
  OMNI_RAIL_CORS_HEADERS,
  SOLANA_PAY_TO_ADDRESS,
  SOLANA_RPC_URL,
  SOLANA_USDC_MINT,
  SUPPORTED_EVM_CHAINS,
} from '../middleware/omni-rail.middleware.js';
import { BASE_PAY_TO_ADDRESS } from '../middleware/l402.middleware.js';
import { renderOmniTestHtml } from '../views/omni-test.view.js';

function validateTxidParam(req: Request, res: Response, next: NextFunction): void {
  const rawTxid = req.params.txid;
  const txid = Array.isArray(rawTxid) ? rawTxid[0] : rawTxid;

  if (!txid || !/^[0-9a-fA-F]{64}$/.test(txid)) {
    res.status(400).json({ error: 'Invalid 64-character hex transaction ID' });
    return;
  }
  next();
}

export function createOmniRailRouter(
  nodeTruthService: NodeTruthService,
  l402Service: L402Service
): Router {
  const router = Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(OMNI_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Interactive Browser Live Wallet Test Console
  router.get('/omni-test', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderOmniTestHtml());
  });

  // Helper: Fetch latest confirmed Solana Mainnet transaction signature for SOLANA_PAY_TO_ADDRESS
  router.get('/v1/omni/solana-latest-tx', async (_req: Request, res: Response) => {
    try {
      const rpcRes = await fetch(SOLANA_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [SOLANA_PAY_TO_ADDRESS, { limit: 1 }],
        }),
      });
      const rpcData: any = await rpcRes.json();
      const first = rpcData?.result?.[0];
      if (!first?.signature) {
        res.status(404).json({ error: 'No confirmed transactions found for address', address: SOLANA_PAY_TO_ADDRESS });
        return;
      }
      res.json({
        address: SOLANA_PAY_TO_ADDRESS,
        signature: first.signature,
        slot: first.slot,
        blockTime: first.blockTime,
        confirmationStatus: first.confirmationStatus,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Solana RPC Query Failed', details: err.message });
    }
  });

  // Public Discovery Endpoint for Quad-Rail (4-Rail) Experimental Gateway
  router.get('/v1/omni/rails', (_req: Request, res: Response) => {
    res.json({
      service: 'Sovereign Node Engine — Quad-Rail (4-Rail) Gateway',
      status: 'ACTIVE',
      isolation: 'Isolated from TaskFuel (/v1/chain/btc/*) production routes',
      rails: [
        {
          rail: 1,
          name: 'Bitcoin Lightning Network (L402)',
          network: 'lightning:mainnet',
          assets: ['BTC (Sats)'],
          header: 'Authorization: L402 <macaroon>:<preimage>',
        },
        {
          rail: 2,
          name: 'Base L2 (x402 v2)',
          network: 'eip155:8453',
          assets: ['USDC'],
          payTo: BASE_PAY_TO_ADDRESS,
          header: 'Payment-Signature: <base64_json>',
        },
        {
          rail: 3,
          name: 'Solana Mainnet (SPL & Native)',
          network: 'solana:mainnet',
          assets: [`USDC (${SOLANA_USDC_MINT})`, 'Native SOL'],
          payTo: SOLANA_PAY_TO_ADDRESS,
          header: 'X-Solana-Payment: <base64_json>',
        },
        {
          rail: 4,
          name: 'Multi-EVM (Arbitrum, Optimism, Polygon, Ethereum Mainnet)',
          networks: Object.values(SUPPORTED_EVM_CHAINS).filter((c) => c.chainId !== 'eip155:8453'),
          assets: ['USDC', 'ETH', 'POL'],
          payTo: BASE_PAY_TO_ADDRESS,
          header: 'X-EVM-Payment: <base64_json>',
        },
      ],
      endpoints: [
        { path: '/v1/omni/btc/mempool', priceSats: 2, priceUsd: '$0.002' },
        { path: '/v1/omni/btc/rbf-shield/:txid', priceSats: 5, priceUsd: '$0.005' },
        { path: '/v1/omni/btc/fees', priceSats: 1, priceUsd: '$0.001' },
      ],
    });
  });

  // 4-Rail Protected: Mempool Entropy
  router.get(
    '/v1/omni/btc/mempool',
    createOmniRailMiddleware(l402Service, {
      priceSats: 2,
      priceUsdcAtomic: '2000',
      priceSolLamports: '10000',
      priceEthWei: '300000000000',
      priceUsdDisplay: '$0.002',
      resourceName: 'omni-mempool-entropy',
      description: 'Quad-Rail (L402 + Base + Solana + Multi-EVM) Bitcoin Core v31.1 Mempool Entropy',
    }),
    async (req: Request, res: Response) => {
      try {
        const mempoolData = await nodeTruthService.getMempoolEntropy();
        res.json({
          source: 'sovereign-bitcoind:31.1 (Mainnet)',
          gateway: 'Quad-Rail (/v1/omni)',
          paymentRail: (req as any).paymentRail,
          onChainReceipt: (req as any).onChainReceipt || undefined,
          data: mempoolData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Omni Mempool Query Failed', details: err.message });
      }
    }
  );

  // 4-Rail Protected: 0-Conf RBF Shield
  router.get(
    '/v1/omni/btc/rbf-shield/:txid',
    validateTxidParam,
    createOmniRailMiddleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceSolLamports: '25000',
      priceEthWei: '1500000000000',
      priceUsdDisplay: '$0.005',
      resourceName: 'omni-rbf-shield',
      description: 'Quad-Rail (L402 + Base + Solana + Multi-EVM) 0-Conf RBF Fraud Shield',
    }),
    async (req: Request, res: Response) => {
      const rawTxid = req.params.txid;
      const txid = Array.isArray(rawTxid) ? rawTxid[0] : rawTxid;
      try {
        const shieldData = await nodeTruthService.checkRbfShield(txid);
        res.json({
          source: 'sovereign-bitcoind:31.1 (Full-RBF Mempool Inspector)',
          gateway: 'Quad-Rail (/v1/omni)',
          paymentRail: (req as any).paymentRail,
          data: shieldData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Omni RBF Shield Query Failed', details: err.message });
      }
    }
  );

  // 4-Rail Protected: Smart Fee Projections
  router.get(
    '/v1/omni/btc/fees',
    createOmniRailMiddleware(l402Service, {
      priceSats: 1,
      priceUsdcAtomic: '1000',
      priceSolLamports: '5000',
      priceEthWei: '300000000000',
      priceUsdDisplay: '$0.001',
      resourceName: 'omni-smart-fees',
      description: 'Quad-Rail (L402 + Base + Solana + Multi-EVM) Bitcoin Core v31.1 Smart Fees',
    }),
    async (req: Request, res: Response) => {
      try {
        const feeData = await nodeTruthService.getSmartFeeEstimates();
        res.json({
          source: 'sovereign-bitcoind:31.1 (estimatesmartfee Mainnet Engine)',
          gateway: 'Quad-Rail (/v1/omni)',
          paymentRail: (req as any).paymentRail,
          data: feeData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Omni Smart Fee Query Failed', details: err.message });
      }
    }
  );

  return router;
}
