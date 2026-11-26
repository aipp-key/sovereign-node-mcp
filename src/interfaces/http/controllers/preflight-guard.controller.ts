import { Router, Request, Response, NextFunction } from 'express';
import { L402Service } from '../../../application/services/l402.service.js';
import { PreflightGuardService } from '../../../application/services/preflight-guard.service.js';
import { getPreflightJwks } from '../../../application/services/preflight-attestation.helper.js';
import {
  PreflightAttestationVerifyRequestSchema,
  PreflightGuardRequestSchema,
  PreflightSandboxRequestSchema,
} from '../../../domain/schemas/preflight-guard.schema.js';
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

  // Free Ed25519 JWKS Endpoint for Offline JWS Verification (200 OK)
  router.get('/v1/guard/jwks.json', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(getPreflightJwks());
  });

  // Free Cryptographic Attestation Verification Endpoint (200 OK)
  router.post('/v1/guard/verify-attestation', (req: Request, res: Response) => {
    const parsed = PreflightAttestationVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid attestation verification payload',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    try {
      const verification = preflightGuardService.verifyAttestation(parsed.data);
      res.json({
        source: 'sovereign-guard:attestation-verifier',
        data: verification,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Attestation verification failed', details: err.message });
    }
  });

  // Free Deterministic Sandbox Simulator for Interactive Web Showcase (200 OK)
  router.post('/v1/guard/preflight/sandbox', (req: Request, res: Response) => {
    const parsed = PreflightSandboxRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid sandbox scenario',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    const report = preflightGuardService.evaluateSandbox(parsed.data.scenario);
    res.json({
      source: 'sovereign-guard:interactive-sandbox',
      sandbox: true,
      scenario: parsed.data.scenario,
      data: report,
    });
  });

  // Unified Pre-Flight Decision Guardrail: 10 sats / $0.010 USDC (L402 + x402 + MPP)
  const preflightGuardMiddleware = createL402Middleware(l402Service, {
    priceSats: 10,
    priceUsdcAtomic: '10000',
    priceUsdDisplay: '$0.010',
    resourceName: 'unified-preflight-guard',
    description:
      'Unified Pre-Flight Transaction Guardrail: combines EVM simulation + address/token safety + optional EIP-7702 or BTC consensus + RBF shield + stablecoin peg context into a single ALLOW/WARN/BLOCK verdict.',
  });

  router.get('/v1/guard/preflight', preflightGuardMiddleware);

  router.post(
    '/v1/guard/preflight',
    preflightGuardMiddleware,
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
