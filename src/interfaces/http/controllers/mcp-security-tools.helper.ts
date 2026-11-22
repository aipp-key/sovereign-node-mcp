import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EvmSafetyService } from '../../../application/services/evm-safety.service.js';
import { PreflightGuardService } from '../../../application/services/preflight-guard.service.js';

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

export function registerEvmAndGuardMcpTools(
  server: McpServer,
  evmSafetyService: EvmSafetyService,
  preflightGuardService: PreflightGuardService
): void {
  server.tool(
    'simulate_evm_tx',
    'Dry-run an EVM transaction (eth_call + gas estimation), decode revert reasons, detect unlimited approvals, EIP-7702 targets, and ONNX drainer risk.',
    {
      chainId: z.number().int().positive().describe('EVM chain ID (1=Ethereum, 8453=Base, 42161=Arbitrum, 10=Optimism, 137=Polygon)'),
      from: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Sender 20-byte EVM address'),
      to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Target 20-byte EVM address'),
      data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/).nullish().describe('Optional hex calldata (default 0x)'),
      value: z.string().nullish().describe('Optional wei value as decimal or 0x-hex string (default 0x0)'),
    },
    async ({ chainId, from, to, data, value }) => {
      try {
        return jsonResult(
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

  server.tool(
    'inspect_evm_address_safety',
    'Classify an EVM address (EOA, EIP-7702 delegated EOA, EIP-1967 proxy, or ERC-20 token), check privileged mint/pause/blacklist controls, SELFDESTRUCT, and ONNX drainer score.',
    {
      chainId: z.number().int().positive().describe('EVM chain ID (e.g. 1, 8453, 42161, 10, 137)'),
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('20-byte EVM address to inspect'),
    },
    async ({ chainId, address }) => {
      try {
        return jsonResult(await evmSafetyService.inspectAddressSafety({ chainId, address }));
      } catch (err: any) {
        return errorResult(`Failed to inspect EVM address safety: ${err?.message || 'unknown error'}`);
      }
    }
  );

  server.tool(
    'preflight_transaction_guard',
    'Unified pre-flight decision guardrail returning ALLOW, WARN, or BLOCK across EVM (simulation + address safety + optional EIP-7702) or BTC (consensus simulation + RBF shield) plus optional stablecoin peg risk.',
    {
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
    async (args) => {
      try {
        if (args.protocol === 'evm') {
          if (!args.chainId || !args.from || !args.to) {
            return errorResult('For protocol=evm, chainId, from, and to are required.');
          }
          return jsonResult(
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
        return jsonResult(
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
