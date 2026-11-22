import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Eip7702ShieldService } from '../../../application/services/eip7702-shield.service.js';
import { EvmSafetyService } from '../../../application/services/evm-safety.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import { Eip7702ShieldRequestSchema } from '../../../domain/schemas/eip7702.schema.js';
import {
  EvmAddressSafetyBatchRequestSchema,
  EvmAddressSafetyRequestSchema,
  EvmSimulateTxRequestSchema,
} from '../../../domain/schemas/evm-safety.schema.js';
import { EvmOnnxRiskAdapter } from '../../../infrastructure/ml/evm-onnx-risk.adapter.js';
import { createL402Middleware, DUAL_RAIL_CORS_HEADERS } from '../middleware/l402.middleware.js';
import { createOmniRailMiddleware, OMNI_RAIL_CORS_HEADERS } from '../middleware/omni-rail.middleware.js';

const BytecodeRiskMlSchema = z
  .object({
    bytecode: z.string().regex(/^0x([0-9a-fA-F]{2})+$/).optional(),
    chainId: z.number().int().positive().optional(),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  })
  .refine((d) => Boolean(d.bytecode) || Boolean(d.chainId && d.address), {
    message: 'Provide either bytecode (0x...) or both chainId and address.',
  });

function validateEip7702Body(req: Request, res: Response, next: NextFunction): void {
  const parsed = Eip7702ShieldRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid EIP-7702 authorizationList payload',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  (req as any).validatedEip7702Request = parsed.data;
  next();
}

export function createEvmShieldRouter(
  eip7702ShieldService: Eip7702ShieldService,
  l402Service: L402Service
): Router {
  const router = Router();

  router.use('/v1/chain/evm', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  router.use('/v1/omni/evm', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(OMNI_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const handleInspect = async (req: Request, res: Response): Promise<void> => {
    try {
      const report = await eip7702ShieldService.inspectAuthorizations((req as any).validatedEip7702Request);
      res.json({
        source: 'sovereign-evm-forensics:eip7702-scanner',
        paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
        verification: 'Cryptographic Multi-Rail Access',
        data: report,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'EIP-7702 Security Inspection Failed', details: err.message });
    }
  };

  // Dual-Rail (L402 Lightning + Base x402 USDC): 5 sats / $0.005 USDC
  router.post(
    '/v1/chain/evm/eip7702-shield',
    createL402Middleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceUsdDisplay: '$0.005',
      resourceName: 'eip7702-auth-shield',
      description:
        'EIP-7702 AuthTx Security Scanner: inspects Pectra authorization_list delegations, bytecode opcodes (SELFDESTRUCT/DELEGATECALL), drain selectors, and cross-chain replay risk.',
      schema: {
        input: {
          body: {
            executionChainId: 'optional positive integer EVM chain ID',
            authorizationList: 'array of { chainId, address, nonce, bytecode? }',
          },
        },
        output: {
          source: 'string',
          paymentRail: 'string',
          data: {
            verdict: 'SAFE_VERIFIED | SUSPICIOUS_UNVERIFIED | CRITICAL_DRAIN_RISK',
            riskScore: 'number (0-100)',
            entries: 'array of per-authorization forensics reports',
          },
        },
      },
    }),
    validateEip7702Body,
    handleInspect
  );

  // Quad-Rail Omni Gateway: 5 sats / $0.005 USDC / Solana / Multi-EVM
  router.post(
    '/v1/omni/evm/eip7702-shield',
    createOmniRailMiddleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceSolLamports: '25000',
      priceEthWei: '1500000000000',
      priceUsdDisplay: '$0.005',
      resourceName: 'omni-eip7702-auth-shield',
      description:
        'Quad-Rail EIP-7702 AuthTx Security Scanner (Lightning L402, Base USDC, Solana SOL/USDC, Multi-EVM).',
    }),
    validateEip7702Body,
    handleInspect
  );

  // PyTorch -> ONNX Neural Bytecode Risk Classifier: 5 sats / $0.005 USDC
  const onnxRisk = new EvmOnnxRiskAdapter();
  router.post(
    '/v1/chain/evm/bytecode-risk-ml',
    createL402Middleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceUsdDisplay: '$0.005',
      resourceName: 'evm-bytecode-risk-ml',
      description:
        'PyTorch-trained ONNX Neural Bytecode Risk Classifier for EVM drainer & obfuscated exploit detection.',
    }),
    async (req: Request, res: Response) => {
      const parsed = BytecodeRiskMlSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid bytecode-risk-ml payload', details: parsed.error.issues });
        return;
      }
      try {
        const result = parsed.data.bytecode
          ? await onnxRisk.scoreBytecode(parsed.data.bytecode)
          : await onnxRisk.fetchAndScoreAddress(parsed.data.chainId!, parsed.data.address!);
        res.json({
          source: 'sovereign-ml:onnxruntime-node (PyTorch MLP)',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          data: result,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'ONNX Bytecode Inference Failed', details: err.message });
      }
    }
  );

  // Pre-Flight EVM Transaction Simulator: 5 sats / $0.005 USDC
  const evmSafety = new EvmSafetyService();
  router.post(
    '/v1/chain/evm/simulate-tx',
    (req: Request, res: Response, next: NextFunction) => {
      const parsed = EvmSimulateTxRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid EVM simulate-tx payload',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      (req as any).validatedSimulateTx = parsed.data;
      next();
    },
    createL402Middleware(l402Service, {
      priceSats: 5,
      priceUsdcAtomic: '5000',
      priceUsdDisplay: '$0.005',
      resourceName: 'evm-simulate-tx',
      description:
        'EVM Pre-Flight Transaction Simulator: dry-runs eth_call + gas estimation, decodes revert reasons, detects unlimited approvals, EIP-7702 target delegations, and ONNX drainer risk.',
    }),
    async (req: Request, res: Response) => {
      try {
        const report = await evmSafety.simulateTransaction((req as any).validatedSimulateTx);
        res.json({
          source: 'sovereign-evm-forensics:simulate-tx',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          data: report,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'EVM Transaction Simulation Failed', details: err.message });
      }
    }
  );

  // EVM Address, Contract & Token Safety Scanner: 4 sats / $0.004 USDC
  router.post(
    '/v1/chain/evm/address-safety',
    (req: Request, res: Response, next: NextFunction) => {
      const parsed = EvmAddressSafetyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid EVM address-safety payload',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      (req as any).validatedAddressSafety = parsed.data;
      next();
    },
    createL402Middleware(l402Service, {
      priceSats: 4,
      priceUsdcAtomic: '4000',
      priceUsdDisplay: '$0.004',
      resourceName: 'evm-address-safety',
      description:
        'EVM Address, Contract & Token Safety Scanner: classifies EOA/EIP-7702/Proxy/ERC-20, checks privileged mint/pause/blacklist controls, dangerous opcodes, and ONNX drainer score.',
    }),
    async (req: Request, res: Response) => {
      try {
        const report = await evmSafety.inspectAddressSafety((req as any).validatedAddressSafety);
        res.json({
          source: 'sovereign-evm-forensics:address-safety',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          data: report,
        });
      } catch (err: any) {
        res.status(500).json({ error: 'EVM Address Safety Inspection Failed', details: err.message });
      }
    }
  );

  // Batch EVM Address, Contract & Token Safety Scanner (up to 10 addresses): 15 sats / $0.015 USDC
  router.post(
    '/v1/chain/evm/address-safety/batch',
    (req: Request, res: Response, next: NextFunction) => {
      const parsed = EvmAddressSafetyBatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid EVM address-safety batch payload',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      (req as any).validatedAddressBatch = parsed.data;
      next();
    },
    createL402Middleware(l402Service, {
      priceSats: 15,
      priceUsdcAtomic: '15000',
      priceUsdDisplay: '$0.015',
      resourceName: 'evm-address-safety-batch',
      description:
        'Batch EVM Address, Contract & Token Safety Scanner: inspects up to 10 addresses in parallel with aggregate verdict and per-address risk breakdown.',
    }),
    async (req: Request, res: Response) => {
      try {
        const { chainId, addresses } = (req as any).validatedAddressBatch as {
          chainId: number;
          addresses: string[];
        };
        const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
        const results = await Promise.all(
          unique.map((address) => evmSafety.inspectAddressSafety({ chainId, address }))
        );
        const maxRiskScore = results.reduce((max, r) => Math.max(max, r.riskScore), 0);
        const overallVerdict = results.some((r) => r.verdict === 'HIGH_RISK')
          ? 'HIGH_RISK'
          : results.some((r) => r.verdict === 'CAUTION')
            ? 'CAUTION'
            : 'SAFE';
        res.json({
          source: 'sovereign-evm-forensics:address-safety-batch',
          paymentRail: (req as any).paymentRail || 'L402-LIGHTNING',
          data: {
            chainId,
            overallVerdict,
            maxRiskScore,
            totalInspected: results.length,
            results,
            inspectedAt: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        res.status(500).json({ error: 'Batch EVM Address Safety Failed', details: err.message });
      }
    }
  );

  return router;
}
