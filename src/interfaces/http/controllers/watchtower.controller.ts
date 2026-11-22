import { Router, Request, Response, NextFunction } from 'express';
import { BtcWatchtowerService } from '../../../application/services/btc-watchtower.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import { CreateBtcWatchRequestSchema } from '../../../domain/schemas/watchtower.schema.js';
import { validatePublicWebhookUrl } from '../../../infrastructure/watchtower/webhook-dispatcher.helper.js';
import { createL402Middleware, DUAL_RAIL_CORS_HEADERS } from '../middleware/l402.middleware.js';

export function createWatchtowerRouter(
  watchtowerService: BtcWatchtowerService,
  l402Service: L402Service
): Router {
  const router = Router();

  router.use('/v1/watchtower', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Prepaid BTC TX & RBF Watchtower subscription: 10 sats / $0.010 USDC (up to 72h TTL)
  router.post(
    '/v1/watchtower/btc/watch',
    (req: Request, res: Response, next: NextFunction) => {
      const parsed = CreateBtcWatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid BTC watchtower payload',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      if (parsed.data.webhookUrl) {
        const check = validatePublicWebhookUrl(parsed.data.webhookUrl);
        if (!check.ok) {
          res.status(400).json({ error: 'Invalid webhookUrl', details: check.reason });
          return;
        }
      }
      (req as any).validatedBtcWatch = parsed.data;
      next();
    },
    createL402Middleware(l402Service, {
      priceSats: 10,
      priceUsdcAtomic: '10000',
      priceUsdDisplay: '$0.010',
      resourceName: 'btc-tx-watchtower',
      description:
        'Prepaid Bitcoin TX & RBF Watchtower: monitors an unconfirmed txid against bare-metal Bitcoin Core v31.1 for confirmations, RBF replacements, or double-spend conflicts with HMAC-signed webhooks.',
    }),
    async (req: Request, res: Response) => {
      try {
        const created = await watchtowerService.createWatch((req as any).validatedBtcWatch);
        res.status(201).json({
          source: 'sovereign-watchtower:btc-v1',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          data: {
            watchId: created.watch.watchId,
            readToken: created.readToken,
            webhookSecret: created.webhookSecret,
            statusUrl: `/v1/watchtower/btc/${created.watch.watchId}`,
            watch: created.watch,
          },
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Failed to create BTC watch', details: err.message });
      }
    }
  );

  // Authenticated status & event timeline lookup (free once watch is created)
  router.get('/v1/watchtower/btc/:watchId', (req: Request, res: Response) => {
    const watchId = String(req.params.watchId || '').trim();
    if (!/^wt_[0-9a-f]{20}$/.test(watchId)) {
      res.status(400).json({ error: 'Invalid watchId format' });
      return;
    }

    const authHeader = req.header('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const token = bearerToken || queryToken;

    const record = watchtowerService.getWatch(watchId, token);
    if (!record) {
      res.status(404).json({ error: 'Watch not found or invalid readToken' });
      return;
    }

    res.json({
      source: 'sovereign-watchtower:btc-v1',
      data: record,
    });
  });

  return router;
}
