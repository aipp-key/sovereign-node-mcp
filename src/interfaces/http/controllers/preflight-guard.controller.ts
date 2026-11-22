import { Router, Request, Response, NextFunction } from 'express';
import { L402Service } from '../../../application/services/l402.service.js';
import { PreflightGuardService } from '../../../application/services/preflight-guard.service.js';
import { PreflightGuardRequestSchema } from '../../../domain/schemas/preflight-guard.schema.js';
import { createL402Middleware, DUAL_RAIL_CORS_HEADERS } from '../middleware/l402.middleware.js';

export function createPreflightGuardRouter(
  preflightGuardService: PreflightGuardService,
  l402Service: L402Service
): Router {
  const router = Router();

  router.use('/v1/guard', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Unified Pre-Flight Decision Guardrail: 10 sats / $0.010 USDC (L402 + x402 + MPP)
  router.post(
    '/v1/guard/preflight',
    (req: Request, res: Response, next: NextFunction) => {
      const parsed = PreflightGuardRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid preflight guard payload',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      (req as any).validatedPreflight = parsed.data;
      next();
    },
    createL402Middleware(l402Service, {
      priceSats: 10,
      priceUsdcAtomic: '10000',
      priceUsdDisplay: '$0.010',
      resourceName: 'unified-preflight-guard',
      description:
        'Unified Pre-Flight Transaction Guardrail: combines EVM simulation + address/token safety + optional EIP-7702 or BTC consensus + RBF shield + stablecoin peg context into a single ALLOW/WARN/BLOCK verdict.',
    }),
    async (req: Request, res: Response) => {
      try {
        const report = await preflightGuardService.evaluate((req as any).validatedPreflight);
        res.json({
          source: 'sovereign-guard:unified-preflight',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          data: report,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Unified Pre-Flight Evaluation Failed', details: err.message });
      }
    }
  );

  return router;
}
