import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AutonomousL402Agent } from '../../application/services/autonomous-agent-client.js';
import { MCP_TOOL_METADATA, toStructuredResult } from './tool-metadata.js';

export function registerStdioSecurityMcpTools(
  server: McpServer,
  sovereignNodeUrl: string,
  agent: AutonomousL402Agent | null,
  maxPriceSats: number
): void {
  // Tool 9: simulate_evm_tx
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
        data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/).optional().describe('Optional hex calldata (default 0x)'),
        value: z.string().optional().describe('Optional wei value as decimal or 0x-hex string (default 0x0)'),
      },
    },
    async ({ chainId, from, to, data, value }) => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: No Lightning payer configured on this agent.' }],
          };
        }

        const result = await agent.fetch(`${sovereignNodeUrl}/v1/chain/evm/simulate-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chainId,
            from,
            to,
            data: data ?? '0x',
            value: value ?? '0x0',
          }),
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(result);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to simulate EVM transaction: ${error.message}` }],
        };
      }
    }
  );

  // Tool 10: inspect_evm_address_safety
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
        if (!agent) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: No Lightning payer configured on this agent.' }],
          };
        }

        const result = await agent.fetch(`${sovereignNodeUrl}/v1/chain/evm/address-safety`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chainId, address }),
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(result);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to inspect EVM address safety: ${error.message}` }],
        };
      }
    }
  );

  // Tool 11: preflight_transaction_guard (Signed Attestation + 10x SLA Service Credit)
  const guardMeta = MCP_TOOL_METADATA.preflight_transaction_guard;
  server.registerTool(
    'preflight_transaction_guard',
    {
      title: guardMeta.title,
      description: guardMeta.description,
      annotations: guardMeta.annotations,
      outputSchema: guardMeta.outputSchema,
      inputSchema: {
        protocol: z.enum(['evm', 'btc']).describe('Target transaction protocol (evm or btc)'),
        chainId: z.number().int().positive().optional().describe('Required for evm protocol (e.g. 8453)'),
        from: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe('Sender address (required for evm)'),
        to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe('Target address (required for evm)'),
        data: z.string().optional().describe('Optional EVM hex calldata'),
        value: z.string().optional().describe('Optional EVM wei value'),
        rawTxHex: z.string().optional().describe('Optional signed raw BTC transaction hex (for btc protocol)'),
        txid: z.string().regex(/^[0-9a-fA-F]{64}$/).optional().describe('Optional 64-hex BTC txid for RBF shield (for btc protocol)'),
        stablecoinSymbol: z.enum(['USDC', 'USDT', 'USDe', 'DAI']).optional().describe('Optional stablecoin peg risk check'),
      },
    },
    async (args) => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: No Lightning payer configured on this agent.' }],
          };
        }

        const result = await agent.fetch(`${sovereignNodeUrl}/v1/guard/preflight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
          maxPriceSatsAllowed: Math.max(maxPriceSats, 10),
        });

        return toStructuredResult(result);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to execute preflight transaction guard: ${error.message}` }],
        };
      }
    }
  );
}
