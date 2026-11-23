import { Router, Request, Response, NextFunction } from 'express';
import { NodeTruthService } from '../../../application/services/node-truth.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import { ILightningPayer } from '../../../application/interfaces/lightning-payer.interface.js';
import { parseBolt11AmountSats } from '../../../infrastructure/bitcoin/bitcoin-forensics.helper.js';
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

export const MAX_BRIDGE_INVOICE_SATS = 25;

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

function validateBridgeInvoiceBody(req: Request, res: Response, next: NextFunction): void {
  const invoice = req.body?.invoice;
  if (!invoice || typeof invoice !== 'string') {
    res.status(400).json({ error: 'Missing BOLT-11 invoice string in request body' });
    return;
  }
  const amountSats = parseBolt11AmountSats(invoice);
  if (amountSats === null) {
    res.status(400).json({
      error: 'Invalid or amountless BOLT-11 Mainnet invoice. Must specify an exact integer satoshi amount.',
    });
    return;
  }
  if (amountSats > MAX_BRIDGE_INVOICE_SATS) {
    res.status(400).json({
      error: `Invoice amount (${amountSats} sats) exceeds micro-bridge safety cap of ${MAX_BRIDGE_INVOICE_SATS} sats.`,
      maxAllowedSats: MAX_BRIDGE_INVOICE_SATS,
    });
    return;
  }
  (req as any).invoiceAmountSats = amountSats;
  next();
}

export function createOmniRailRouter(
  nodeTruthService: NodeTruthService,
  l402Service: L402Service,
  lightningPayer?: ILightningPayer
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

  // Interactive Browser Live Wallet Test Console (disabled by default in production; set ENABLE_OMNI_TEST_UI=true to enable)
  router.get('/omni-test', (_req: Request, res: Response) => {
    if (process.env.ENABLE_OMNI_TEST_UI !== 'true') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderOmniTestHtml());
  });

  // Helper: Fetch latest confirmed Solana Mainnet transaction signature for SOLANA_PAY_TO_ADDRESS (test-UI only)
  router.get('/v1/omni/solana-latest-tx', async (_req: Request, res: Response) => {
    if (process.env.ENABLE_OMNI_TEST_UI !== 'true') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
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
        { path: '/v1/omni/btc/mempool', method: 'GET', priceSats: 1, priceUsd: '$0.001' },
        { path: '/v1/omni/btc/rbf-shield/:txid', method: 'GET', priceSats: 5, priceUsd: '$0.005' },
        { path: '/v1/omni/btc/fees', method: 'GET', priceSats: 1, priceUsd: '$0.001' },
        { path: '/v1/omni/btc/next-block-xray', method: 'GET', priceSats: 5, priceUsd: '$0.005' },
        { path: '/v1/omni/btc/simulate-tx', method: 'POST', priceSats: 5, priceUsd: '$0.005' },
        {
          path: '/v1/omni/pay-lightning',
          method: 'POST',
          maxInvoiceSats: MAX_BRIDGE_INVOICE_SATS,
          priceUsd: '$0.025',
          desc: 'Pay any BOLT-11 Lightning invoice (up to 25 sats) using Solana, Base, or Arbitrum and receive cryptographic preimage.',
        },
      ],
    });
  });

  // 4-Rail Protected: Mempool Entropy
  router.get(
    '/v1/omni/btc/mempool',
    createOmniRailMiddleware(l402Service, {
      priceSats: 1,
      priceUsdcAtomic: '1000',
      priceSolLamports: '5000',
      priceEthWei: '300000000000',
      priceUsdDisplay: '$0.001',
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

  // 4-Rail Protected: Next Block X-Ray (getblocktemplate Oracle)
  router.get(
    ['/v1/omni/btc/next-block-xray', '/v1/omni/btc/next-block-xray/:txid'],
    validateOptionalTxid,
    createOmniRailMiddleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceSolLamports: '25000',
      priceEthWei: '300000000000',
      priceUsdDisplay: '$0.005',
      resourceName: 'omni-next-block-xray',
      description: 'Quad-Rail Live Bitcoin Core v31.1 Candidate Block Template X-Ray & Queue Rank Oracle',
    }),
    async (req: Request, res: Response) => {
      const rawParam = req.params.txid || (req.query.txid as string | undefined);
      const txid = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      try {
        const xrayData = await nodeTruthService.getNextBlockXray(txid);
        res.json({
          source: 'sovereign-bitcoind:31.1 (getblocktemplate Candidate Block Engine)',
          gateway: 'Quad-Rail (/v1/omni)',
          paymentRail: (req as any).paymentRail,
          onChainReceipt: (req as any).onChainReceipt || undefined,
          data: xrayData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Omni Next Block X-Ray Failed', details: err.message });
      }
    }
  );

  // 4-Rail Protected: Zero-Broadcast Consensus & Script Dry-Run Simulator (testmempoolaccept)
  router.post(
    '/v1/omni/btc/simulate-tx',
    validateRawTxHexBody,
    createOmniRailMiddleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceSolLamports: '25000',
      priceEthWei: '400000000000',
      priceUsdDisplay: '$0.005',
      resourceName: 'omni-simulate-tx',
      description: 'Quad-Rail Zero-Broadcast Bitcoin Core v31.1 Consensus & Script Simulator',
    }),
    async (req: Request, res: Response) => {
      try {
        const simData = await nodeTruthService.simulateTxConsensus(req.body.rawTxHex);
        res.json({
          source: 'sovereign-bitcoind:31.1 (testmempoolaccept Zero-Broadcast Engine)',
          gateway: 'Quad-Rail (/v1/omni)',
          paymentRail: (req as any).paymentRail,
          onChainReceipt: (req as any).onChainReceipt || undefined,
          data: simData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Omni Tx Simulation Failed', details: err.message });
      }
    }
  );

  // 4-Rail Protected: Walletless Lightning Bridge (Pay any <=25 sat BOLT-11 invoice using Solana/Base/Arbitrum)
  router.post(
    '/v1/omni/pay-lightning',
    validateBridgeInvoiceBody,
    createOmniRailMiddleware(l402Service, {
      priceSats: 25,
      priceUsdcAtomic: '25000',
      priceSolLamports: '100000',
      priceEthWei: '400000000000',
      priceUsdDisplay: '$0.025',
      resourceName: 'omni-pay-lightning-bridge',
      description:
        'SUB-LIG Universal Bridge: Settle a BOLT-11 Lightning invoice (up to 25 sats) using Solana, Base, or Arbitrum and receive cryptographic preimage.',
    }),
    async (req: Request, res: Response) => {
      if (!lightningPayer) {
        res.status(503).json({ error: 'Lightning Payer backend is not configured on this node' });
        return;
      }
      try {
        const invoice: string = req.body.invoice.trim();
        const invoiceAmountSats: number = (req as any).invoiceAmountSats;
        const paymentResult = await lightningPayer.payInvoice(invoice);

        res.json({
          status: 'SETTLED',
          bridge: 'SUB-LIG Quad-Rail -> Lightning Network',
          paidByAgentViaRail: (req as any).paymentRail,
          onChainReceipt: (req as any).onChainReceipt || undefined,
          lightningSettlement: {
            invoiceAmountSats,
            paymentHash: paymentResult.paymentHash,
            preimage: paymentResult.preimage,
            routingFeeSat: paymentResult.feeSat,
          },
          settledAt: Math.floor(Date.now() / 1000),
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Lightning Bridge Settlement Failed', details: err.message });
      }
    }
  );

  return router;
}
