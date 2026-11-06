import { Router, Request, Response } from 'express';
import { NodeTruthService } from '../../../application/services/node-truth.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import { createL402Middleware } from '../middleware/l402.middleware.js';

export function createNodeTruthRouter(
  nodeTruthService: NodeTruthService,
  l402Service: L402Service
): Router {
  const router = Router();

  // Public Health endpoint
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'UP',
      service: 'Sovereign Node Intelligence Engine',
      protocol: 'L402-Enabled',
      nodeSynced: true,
      timestamp: Math.floor(Date.now() / 1000),
    });
  });

  // Protected: Mempool Entropy Signal (2 sats)
  router.get(
    '/v1/truth/mempool',
    createL402Middleware(l402Service, { priceSats: 2, resourceName: 'mempool-entropy' }),
    async (_req: Request, res: Response) => {
      try {
        const mempoolData = await nodeTruthService.getMempoolEntropy();
        res.json({
          source: 'sovereign-bitcoind:31.1 (Mainnet)',
          verification: 'Preimage-Settled Cryptographic Access',
          data: mempoolData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Mempool Query Failed', details: err.message });
      }
    }
  );

  // Protected: Smart Fee Projection (1 sat)
  router.get(
    '/v1/truth/fees',
    createL402Middleware(l402Service, { priceSats: 1, resourceName: 'smart-fees' }),
    async (_req: Request, res: Response) => {
      try {
        const feeData = await nodeTruthService.getSmartFeeEstimates();
        res.json({
          source: 'sovereign-bitcoind:31.1 (estimatesmartfee Mainnet Engine)',
          verification: 'Preimage-Settled Cryptographic Access',
          data: feeData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Smart Fee Query Failed', details: err.message });
      }
    }
  );

  // Protected: 0-Conf RBF Double-Spend Shield (5 sats)
  router.get(
    '/v1/truth/rbf-shield/:txid',
    createL402Middleware(l402Service, { priceSats: 5, resourceName: 'rbf-shield' }),
    async (req: Request, res: Response) => {
      const rawTxid = req.params.txid;
      const txid = Array.isArray(rawTxid) ? rawTxid[0] : rawTxid;

      if (!txid || !/^[0-9a-fA-F]{64}$/.test(txid)) {
        res.status(400).json({ error: 'Invalid 64-character hex transaction ID' });
        return;
      }

      try {
        const shieldData = await nodeTruthService.checkRbfShield(txid);
        res.json({
          source: 'sovereign-bitcoind:31.1 (Full-RBF Mempool Inspector)',
          verification: 'Preimage-Settled Cryptographic Access',
          data: shieldData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'RBF Shield Query Failed', details: err.message });
      }
    }
  );

  // Protected: Block Header Truth (1 sat)
  router.get(
    '/v1/truth/block',
    createL402Middleware(l402Service, { priceSats: 1, resourceName: 'block-header-truth' }),
    async (_req: Request, res: Response) => {
      try {
        const blockData = await nodeTruthService.getLatestBlockHeader();
        res.json({
          source: 'sovereign-bitcoind:31.1 (Mainnet)',
          verification: 'Preimage-Settled Cryptographic Access',
          data: blockData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Block Header Query Failed', details: err.message });
      }
    }
  );

  // Protected: Lightning Topology Signal (5 sats)
  router.get(
    '/v1/truth/topology',
    createL402Middleware(l402Service, { priceSats: 5, resourceName: 'lightning-topology' }),
    async (_req: Request, res: Response) => {
      try {
        const topologyData = await nodeTruthService.getLightningTopology();
        res.json({
          source: 'sovereign-lnd:0.21.3 (Mainnet)',
          verification: 'Preimage-Settled Cryptographic Access',
          data: topologyData,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Topology Query Failed', details: err.message });
      }
    }
  );

  return router;
}
