import crypto from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { NodeTruthService } from '../../../application/services/node-truth.service.js';
import { Eip7702ShieldService } from '../../../application/services/eip7702-shield.service.js';
import { L402Service } from '../../../application/services/l402.service.js';
import { createL402Middleware } from '../middleware/l402.middleware.js';

const SANDBOX_CALLS_PER_DAY = Number(process.env.MCP_SANDBOX_CALLS_PER_DAY) || 15;
const SANDBOX_WINDOW_MS = 24 * 60 * 60 * 1000;
const sandboxBuckets = new Map<string, { count: number; resetAt: number }>();

const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Payment-Signature, X-Payment, X-Payment-Proof, Payment-Proof, X-Payment-Retry-Voucher, X-SovRoute-Demo-Key, Mcp-Session-Id',
  'Access-Control-Expose-Headers':
    'WWW-Authenticate, Payment-Required, X-Payment-Requirements, Payment-Response, X-Payment-Response, X-Payment-Retry-Voucher, X-Sandbox-Limit, X-Sandbox-Remaining, X-Sandbox-Bypass, Mcp-Session-Id',
};

const TOOL_PRICING: Record<string, { priceSats: number; priceUsdcAtomic: string; priceUsdDisplay: string }> = {
  get_bitcoin_smart_fees: { priceSats: 1, priceUsdcAtomic: '1000', priceUsdDisplay: '$0.001' },
  verify_block_header: { priceSats: 1, priceUsdcAtomic: '1000', priceUsdDisplay: '$0.001' },
  get_mempool_entropy: { priceSats: 2, priceUsdcAtomic: '2000', priceUsdDisplay: '$0.002' },
  get_next_block_xray: { priceSats: 3, priceUsdcAtomic: '3000', priceUsdDisplay: '$0.003' },
  check_rbf_fraud_shield: { priceSats: 5, priceUsdcAtomic: '5000', priceUsdDisplay: '$0.005' },
  simulate_raw_transaction: { priceSats: 5, priceUsdcAtomic: '5000', priceUsdDisplay: '$0.005' },
  inspect_eip7702_authorization: { priceSats: 5, priceUsdcAtomic: '5000', priceUsdDisplay: '$0.005' },
};

function consumeDailySandboxQuota(clientKey: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = sandboxBuckets.get(clientKey);
  if (!existing || now >= existing.resetAt) {
    const fresh = { count: 1, resetAt: now + SANDBOX_WINDOW_MS };
    sandboxBuckets.set(clientKey, fresh);
    if (sandboxBuckets.size > 10000) {
      for (const [k, v] of sandboxBuckets.entries()) {
        if (now >= v.resetAt) sandboxBuckets.delete(k);
      }
    }
    return { allowed: true, remaining: SANDBOX_CALLS_PER_DAY - 1, resetAt: fresh.resetAt };
  }

  if (existing.count >= SANDBOX_CALLS_PER_DAY) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: SANDBOX_CALLS_PER_DAY - existing.count, resetAt: existing.resetAt };
}

function hasPayPerCallCredential(req: Request): boolean {
  const auth = req.header('authorization');
  return Boolean(
    (auth && auth.startsWith('L402 ')) ||
      req.header('payment-signature') ||
      req.header('x-payment') ||
      req.header('x-payment-proof') ||
      req.header('payment-proof') ||
      req.header('x-payment-retry-voucher') ||
      req.header('x-agenticmarket-signature')
  );
}

/**
 * Checks whether the caller presented a valid server-configured demo bypass key
 * (used for hosted showcase flows such as CrewAI Cloud without disabling L402/x402 for public traffic).
 */
function hasValidDemoBypass(req: Request): boolean {
  const expected = process.env.MCP_DEMO_BYPASS_KEY?.trim();
  const provided = req.header('x-sovroute-demo-key')?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildJsonResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function buildErrorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

function buildHostedMcpServer(
  nodeTruthService: NodeTruthService,
  eip7702ShieldService: Eip7702ShieldService
): McpServer {
  const server = new McpServer({
    name: 'sovroute-mcp',
    version: '1.0.0',
  });

  server.tool(
    'get_bitcoin_smart_fees',
    'Fetch real-time Bitcoin mainnet fee rates (sat/vB) estimated directly by sovereign Bitcoin Core v31.1 RPC.',
    {},
    async () => {
      try {
        return buildJsonResult(await nodeTruthService.getSmartFeeEstimates());
      } catch (err: any) {
        return buildErrorResult(`Failed to fetch Bitcoin smart fees: ${err?.message || 'unknown error'}`);
      }
    }
  );

  server.tool(
    'get_mempool_entropy',
    'Fetch live Bitcoin mainnet mempool statistics (unconfirmed tx count, vsize, fee pool) directly from Bitcoin Core RPC.',
    {},
    async () => {
      try {
        return buildJsonResult(await nodeTruthService.getMempoolEntropy());
      } catch (err: any) {
        return buildErrorResult(`Failed to query mempool entropy: ${err?.message || 'unknown error'}`);
      }
    }
  );

  server.tool(
    'check_rbf_fraud_shield',
    'Verify if an unconfirmed Bitcoin transaction is vulnerable to BIP-125 Replace-By-Fee (RBF) double-spend fraud.',
    {
      txid: z.string().regex(/^[0-9a-fA-F]{64}$/).describe('64-character hex Bitcoin transaction ID'),
    },
    async ({ txid }) => {
      try {
        return buildJsonResult(await nodeTruthService.checkRbfShield(txid));
      } catch (err: any) {
        return buildErrorResult(`Failed to inspect RBF shield for ${txid}: ${err?.message || 'unknown error'}`);
      }
    }
  );

  server.tool(
    'get_next_block_xray',
    'Inspect live candidate block template (getblocktemplate) for cutoff fee rates and optional txid queue rank.',
    {
      txid: z
        .string()
        .regex(/^[0-9a-fA-F]{64}$/)
        .nullish()
        .describe('Optional 64-character hex Bitcoin transaction ID to inspect for inclusion rank'),
    },
    async ({ txid }) => {
      try {
        return buildJsonResult(await nodeTruthService.getNextBlockXray(txid ?? undefined));
      } catch (err: any) {
        return buildErrorResult(`Failed to inspect next-block template: ${err?.message || 'unknown error'}`);
      }
    }
  );

  server.tool(
    'simulate_raw_transaction',
    'Execute zero-broadcast Bitcoin Core v31.1 consensus & script validation (testmempoolaccept) without broadcasting to P2P network.',
    {
      rawTxHex: z
        .string()
        .min(100)
        .max(200000)
        .regex(/^[0-9a-fA-F]+$/)
        .refine((v) => v.length % 2 === 0, 'rawTxHex must have even length')
        .describe('Hexadecimal signed raw Bitcoin transaction to simulate'),
    },
    async ({ rawTxHex }) => {
      try {
        return buildJsonResult(await nodeTruthService.simulateTxConsensus(rawTxHex));
      } catch (err: any) {
        const rawMsg = String(err?.message || 'unknown error');
        const safeMsg =
          rawMsg.includes('Command failed') || rawMsg.includes('sh -c')
            ? 'Transaction rejected by Bitcoin Core consensus decoder (malformed or invalid raw transaction hex).'
            : rawMsg;
        return buildErrorResult(`Failed to simulate transaction: ${safeMsg}`);
      }
    }
  );

  server.tool(
    'verify_block_header',
    'Verify latest mined Bitcoin mainnet block header (height, hash, difficulty, timestamp) directly from Bitcoin Core RPC.',
    {},
    async () => {
      try {
        return buildJsonResult(await nodeTruthService.getLatestBlockHeader());
      } catch (err: any) {
        return buildErrorResult(`Failed to verify block header: ${err?.message || 'unknown error'}`);
      }
    }
  );

  server.tool(
    'inspect_eip7702_authorization',
    'Inspect an EIP-7702 (Pectra) authorization_list for wallet drainer risks, dangerous opcodes, and cross-chain replay vectors.',
    {
      executionChainId: z.number().int().positive().nullish().describe('Target EVM execution chain ID'),
      authorizationList: z
        .array(
          z.object({
            chainId: z.union([z.number().int().nonnegative(), z.string()]),
            address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
            nonce: z.union([z.number().int().nonnegative(), z.string()]),
            bytecode: z.string().nullish(),
          })
        )
        .min(1)
        .max(50),
    },
    async ({ executionChainId, authorizationList }) => {
      try {
        return buildJsonResult(
          await eip7702ShieldService.inspectAuthorizations({
            executionChainId: executionChainId ?? undefined,
            authorizationList: authorizationList.map((entry) => ({
              ...entry,
              bytecode: entry.bytecode ?? undefined,
            })),
          })
        );
      } catch (err: any) {
        return buildErrorResult(`Failed to inspect EIP-7702 authorization: ${err?.message || 'unknown error'}`);
      }
    }
  );

  return server;
}

export function createMcpRouter(
  nodeTruthService: NodeTruthService,
  eip7702ShieldService: Eip7702ShieldService,
  l402Service?: L402Service
): Router {
  const router = Router();

  router.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(MCP_CORS_HEADERS)) {
      res.setHeader(k, v);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  router.post('/mcp', async (req: Request, res: Response) => {
    const isToolCall = req.body?.method === 'tools/call';

    if (isToolCall) {
      const toolName = String(req.body?.params?.name || 'mcp-tool');
      const pricing = TOOL_PRICING[toolName] || {
        priceSats: 3,
        priceUsdcAtomic: '3000',
        priceUsdDisplay: '$0.003',
      };

      const runPayPerCallGate = async (): Promise<boolean> => {
        if (!l402Service) {
          res.status(402).json({
            error:
              'Free evaluation quota (15 tool calls/24h) exceeded. Settle per call via L402 Lightning (1-5 sats) or x402 Base USDC ($0.001-$0.005).',
            protocol: 'L402 / x402',
            priceSats: pricing.priceSats,
            priceUsd: pricing.priceUsdDisplay,
          });
          return false;
        }
        const mw = createL402Middleware(l402Service, {
          priceSats: pricing.priceSats,
          priceUsdcAtomic: pricing.priceUsdcAtomic,
          priceUsdDisplay: pricing.priceUsdDisplay,
          resourceName: `mcp:${toolName}`,
          description: `SovRoute Remote MCP Pay-Per-Call (${toolName})`,
        });
        let authorized = false;
        await mw(req, res, (() => {
          authorized = true;
        }) as NextFunction);
        return authorized;
      };

      if (hasPayPerCallCredential(req)) {
        const paidOk = await runPayPerCallGate();
        if (!paidOk) return;
      } else if (hasValidDemoBypass(req)) {
        res.setHeader('X-Sandbox-Bypass', 'demo');
      } else if (process.env.SOVROUTE_MCP_SANDBOX_ENABLED === 'false') {
        const paidOk = await runPayPerCallGate();
        if (!paidOk) return;
      } else {
        const clientIp =
          (req.headers['cf-connecting-ip'] as string)?.trim() ||
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.ip ||
          'unknown';
        const quota = consumeDailySandboxQuota(clientIp);
        res.setHeader('X-Sandbox-Limit', String(SANDBOX_CALLS_PER_DAY));
        res.setHeader('X-Sandbox-Remaining', String(quota.remaining));
        if (!quota.allowed) {
          const paidOk = await runPayPerCallGate();
          if (!paidOk) return;
        }
      }
    }

    const server = buildHostedMcpServer(nodeTruthService, eip7702ShieldService);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close().catch(() => null);
      server.close().catch(() => null);
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: err?.message || 'Internal MCP server error' },
          id: null,
        });
      }
    }
  });

  router.get('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST /mcp for stateless Streamable HTTP MCP.' },
      id: null,
    });
  });

  router.delete('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed in stateless MCP mode.' },
      id: null,
    });
  });

  return router;
}
