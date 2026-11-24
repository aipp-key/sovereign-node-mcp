import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EvmSafetyService } from '../../../application/services/evm-safety.service.js';
import { PreflightGuardService } from '../../../application/services/preflight-guard.service.js';
import { MCP_TOOL_METADATA, toStructuredResult } from '../../mcp/tool-metadata.js';

function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

export function registerEvmAndGuardMcpTools(
  server: McpServer,
  evmSafetyService: EvmSafetyService,
  preflightGuardService: PreflightGuardService
): void {
  const simulateMeta = MCP_TOOL_METADATA.simulate_evm_tx;
  server.registerTool(
    'simulate_evm_tx',
    {
      title: simulateMeta.title,
      description: simulateMeta.description,
      annotations: simulateMeta.annotations,
      outputSchema: simulateMeta.outputSchema,
      inputSchema: {
        chainId: z.number().int().positive().describe('EVM chain ID (1=Ethereum, 8453=Base, 42161=Arbitrum, 10=Optimism, 137=Polygon)'),
        from: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Sender 20-byte EVM address'),
        to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Target 20-byte EVM address'),
        data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/).nullish().describe('Optional hex calldata (default 0x)'),
        value: z.string().nullish().describe('Optional wei value as decimal or 0x-hex string (default 0x0)'),
      },
    },
    async ({ chainId, from, to, data, value }) => {
      try {
        return toStructuredResult(
          await evmSafetyService.simulateTransaction({
            chainId,
            from,
            to,
            data: data ?? '0x',
            value: value ?? '0x0',
            blockTag: 'latest',
          })
        );
      } catch (err: any) {
        return errorResult(`Failed to simulate EVM tx: ${err?.message || 'unknown error'}`);
      }
    }
  );

  const addressMeta = MCP_TOOL_METADATA.inspect_evm_address_safety;
  server.registerTool(
    'inspect_evm_address_safety',
    {
      title: addressMeta.title,
      description: addressMeta.description,
      annotations: addressMeta.annotations,
      outputSchema: addressMeta.outputSchema,
      inputSchema: {
        chainId: z.number().int().positive().describe('EVM chain ID (e.g. 1, 8453, 42161, 10, 137)'),
        address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('20-byte EVM address to inspect'),
      },
    },
    async ({ chainId, address }) => {
      try {
        return toStructuredResult(await evmSafetyService.inspectAddressSafety({ chainId, address }));
      } catch (err: any) {
        return errorResult(`Failed to inspect EVM address safety: ${err?.message || 'unknown error'}`);
      }
    }
  );

  const guardMeta = MCP_TOOL_METADATA.preflight_transaction_guard;
  server.registerTool(
    'preflight_transaction_guard',
    {
      title: guardMeta.title,
      description: guardMeta.description,
      annotations: guardMeta.annotations,
      outputSchema: guardMeta.outputSchema,
      inputSchema: {
        protocol: z.enum(['evm', 'btc']).describe('Target transaction protocol'),
        chainId: z.number().int().positive().nullish().describe('Required for evm protocol'),
        from: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullish().describe('Required for evm protocol'),
        to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullish().describe('Required for evm protocol'),
        data: z.string().nullish().describe('Optional EVM hex calldata'),
        value: z.string().nullish().describe('Optional EVM wei value'),
        rawTxHex: z.string().nullish().describe('Optional signed raw BTC transaction hex (for btc protocol)'),
        txid: z.string().regex(/^[0-9a-fA-F]{64}$/).nullish().describe('Optional BTC txid for RBF shield (for btc protocol)'),
        stablecoinSymbol: z.enum(['USDC', 'USDT', 'USDe', 'DAI']).nullish().describe('Optional stablecoin peg risk check'),
      },
    },
    async (args) => {
      try {
        if (args.protocol === 'evm') {
          if (!args.chainId || !args.from || !args.to) {
            return errorResult('For protocol=evm, chainId, from, and to are required.');
          }
          return toStructuredResult(
            await preflightGuardService.evaluate({
              protocol: 'evm',
              chainId: args.chainId,
              from: args.from,
              to: args.to,
              data: args.data ?? '0x',
              value: args.value ?? '0x0',
              blockTag: 'latest',
              stablecoinSymbol: args.stablecoinSymbol ?? undefined,
            })
          );
        }
        if (!args.rawTxHex && !args.txid) {
          return errorResult('For protocol=btc, provide at least rawTxHex or txid.');
        }
        return toStructuredResult(
          await preflightGuardService.evaluate({
            protocol: 'btc',
            rawTxHex: args.rawTxHex ?? undefined,
            txid: args.txid ?? undefined,
            stablecoinSymbol: args.stablecoinSymbol ?? undefined,
          })
        );
      } catch (err: any) {
        return errorResult(`Pre-flight guard evaluation failed: ${err?.message || 'unknown error'}`);
      }
    }
  );
}
