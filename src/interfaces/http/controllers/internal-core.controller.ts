import crypto from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { NodeTruthService } from '../../../application/services/node-truth.service.js';

export interface InternalCoreOptions {
  coreBridgeKey?: string;
}

function keysMatch(provided: string, expected: string): boolean {
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Internal read-only bridge serving bare-metal Bitcoin Core and LND state
 * exclusively to the authenticated sovroute.com edge gateway.
 */
export function createInternalCoreRouter(
  nodeTruthService: NodeTruthService,
  options: InternalCoreOptions = {}
): Router {
  const router = Router();

  router.use('/internal/core', (req: Request, res: Response, next: NextFunction): void => {
    const expectedKey = (options.coreBridgeKey ?? process.env.CORE_BRIDGE_KEY ?? '').trim();
    if (!expectedKey) {
      res.status(503).json({ error: 'Core bridge not configured' });
      return;
    }

    const providedKey = req.header('x-sovroute-core-key')?.trim();
    if (!providedKey || !keysMatch(providedKey, expectedKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  });

  router.get('/internal/core/btc-fees', async (_req: Request, res: Response): Promise<void> => {
    try {
      const [fees, mempool] = await Promise.all([
        nodeTruthService.getSmartFeeEstimates(),
        nodeTruthService.getMempoolEntropy(),
      ]);
      res.json({
        status: 'success',
        network: 'mainnet',
        source: 'sovereign-bitcoind:31.1',
        timestamp: Date.now(),
        data: {
          fastestFee: Math.ceil(fees.fastestSatPerVb),
          halfHourFee: Math.ceil(fees.halfHourSatPerVb),
          hourFee: Math.ceil(fees.hourSatPerVb),
          minimumFee: Math.max(1, Math.floor(mempool.minFeeRateSatPerVb)),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'Core BTC fees query failed', details: message });
    }
  });

  router.get('/internal/core/btc-tip', async (_req: Request, res: Response): Promise<void> => {
    try {
      const block = await nodeTruthService.getLatestBlockHeader();
      res.json({
        status: 'success',
        network: 'mainnet',
        source: 'sovereign-bitcoind:31.1',
        timestamp: Date.now(),
        data: {
          height: block.height,
          hash: block.hash,
          synced: true,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'Core BTC tip query failed', details: message });
    }
  });

  router.get('/internal/core/lightning-stats', async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await nodeTruthService.getLightningNetworkStats();
      res.json({
        status: 'success',
        network: 'mainnet',
        source: 'sovereign-lnd:0.21.3',
        timestamp: Date.now(),
        data: {
          channel_count: stats.channel_count,
          node_count: stats.node_count,
          total_capacity_sats: stats.total_capacity_sats,
          avg_fee_rate_ppm: stats.avg_fee_rate_ppm,
          med_fee_rate_ppm: stats.med_fee_rate_ppm,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'Core Lightning stats query failed', details: message });
    }
  });

  return router;
}
