import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AutonomousL402Agent } from '../../application/services/autonomous-agent-client.js';
import { ILightningPayer } from '../../application/interfaces/lightning-payer.interface.js';
import { PhoenixdPayerAdapter } from '../../infrastructure/lightning/phoenixd-payer.adapter.js';
import { NwcPayerAdapter } from '../../infrastructure/alby/nwc-payer.adapter.js';
import { registerStdioSecurityMcpTools } from './stdio-security-tools.helper.js';
import { MCP_TOOL_METADATA, toStructuredResult } from './tool-metadata.js';

export interface SovereignMcpConfig {
  sovereignNodeUrl?: string;
  phoenixdUrl?: string;
  phoenixdPassword?: string;
  nwcUrl?: string;
  maxPriceSatsAllowed?: number;
  payer?: ILightningPayer;
}

export function createPayerFromEnv(config: SovereignMcpConfig): ILightningPayer | null {
  if (config.payer) {
    return config.payer;
  }

  if (config.nwcUrl) {
    return new NwcPayerAdapter({
      nostrWalletConnectUrl: config.nwcUrl,
    });
  }

  if (config.phoenixdUrl && config.phoenixdPassword) {
    return new PhoenixdPayerAdapter({
      baseUrl: config.phoenixdUrl,
      httpPassword: config.phoenixdPassword,
    });
  }

  return null;
}

export function createSovereignMcpServer(config: SovereignMcpConfig = {}): {
  server: McpServer;
  start: () => Promise<void>;
} {
  const sovereignNodeUrl = config.sovereignNodeUrl || process.env.SOVEREIGN_NODE_URL || 'https://node.sovroute.com';
  const maxPriceSats = config.maxPriceSatsAllowed || Number(process.env.MAX_PRICE_SATS_ALLOWED) || 10;

  const payer =
    config.payer ||
    createPayerFromEnv({
      phoenixdUrl: config.phoenixdUrl || process.env.PHOENIXD_URL,
      phoenixdPassword: config.phoenixdPassword || process.env.PHOENIXD_PASSWORD,
      nwcUrl: config.nwcUrl || process.env.ALBY_NWC_URL || process.env.NWC_URL,
    });

  const agent = payer ? new AutonomousL402Agent(payer) : null;

  const server = new McpServer({
    name: 'sovereign-node-mcp',
    version: '1.1.0',
  });

  // Tool 1: get_bitcoin_smart_fees
  const smartFeesMeta = MCP_TOOL_METADATA.get_bitcoin_smart_fees;
  server.registerTool(
    'get_bitcoin_smart_fees',
    {
      title: smartFeesMeta.title,
      description: smartFeesMeta.description,
      annotations: smartFeesMeta.annotations,
      outputSchema: smartFeesMeta.outputSchema,
      inputSchema: {},
    },
    async () => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: No Lightning payer configured (Set PHOENIXD_PASSWORD or ALBY_NWC_URL) to pay for sovereign node L402 intelligence.',
              },
            ],
          };
        }

        const data = await agent.fetch(`${sovereignNodeUrl}/v1/truth/fees`, {
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(data);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to fetch Bitcoin smart fees: ${error.message}` }],
        };
      }
    }
  );

  // Tool 2: check_rbf_fraud_shield
  const rbfMeta = MCP_TOOL_METADATA.check_rbf_fraud_shield;
  server.registerTool(
    'check_rbf_fraud_shield',
    {
      title: rbfMeta.title,
      description: rbfMeta.description,
      annotations: rbfMeta.annotations,
      outputSchema: rbfMeta.outputSchema,
      inputSchema: {
        txid: z.string().length(64).describe('The 64-character hex Bitcoin transaction ID'),
      },
    },
    async ({ txid }) => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: No Lightning payer configured to pay for RBF Fraud Shield intelligence.',
              },
            ],
          };
        }

        const data = await agent.fetch(`${sovereignNodeUrl}/v1/truth/rbf-shield/${txid}`, {
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(data);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to inspect RBF shield for ${txid}: ${error.message}` }],
        };
      }
    }
  );

  // Tool 3: get_mempool_entropy
  const mempoolMeta = MCP_TOOL_METADATA.get_mempool_entropy;
  server.registerTool(
    'get_mempool_entropy',
    {
      title: mempoolMeta.title,
      description: mempoolMeta.description,
      annotations: mempoolMeta.annotations,
      outputSchema: mempoolMeta.outputSchema,
      inputSchema: {},
    },
    async () => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: No Lightning payer configured.',
              },
            ],
          };
        }

        const data = await agent.fetch(`${sovereignNodeUrl}/v1/truth/mempool`, {
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(data);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to query mempool entropy: ${error.message}` }],
        };
      }
    }
  );

  // Tool 4: verify_block_header
  const headerMeta = MCP_TOOL_METADATA.verify_block_header;
  server.registerTool(
    'verify_block_header',
    {
      title: headerMeta.title,
      description: headerMeta.description,
      annotations: headerMeta.annotations,
      outputSchema: headerMeta.outputSchema,
      inputSchema: {},
    },
    async () => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: No Lightning payer configured.',
              },
            ],
          };
        }

        const data = await agent.fetch(`${sovereignNodeUrl}/v1/truth/block`, {
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(data);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to verify block header: ${error.message}` }],
        };
      }
    }
  );

  // Tool 5: pay_lightning_invoice
  const payMeta = MCP_TOOL_METADATA.pay_lightning_invoice;
  server.registerTool(
    'pay_lightning_invoice',
    {
      title: payMeta.title,
      description: payMeta.description,
      annotations: payMeta.annotations,
      outputSchema: payMeta.outputSchema,
      inputSchema: {
        invoice: z.string().describe('BOLT-11 Lightning invoice string (starts with lnbc...)'),
      },
    },
    async ({ invoice }) => {
      try {
        if (!payer) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: No Lightning payer configured on this agent.',
              },
            ],
          };
        }

        const result = await payer.payInvoice(invoice);

        return toStructuredResult({
          success: true,
          paymentHash: result.paymentHash,
          preimage: result.preimage,
          feeSat: result.feeSat,
        });
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to pay Lightning invoice: ${error.message}` }],
        };
      }
    }
  );

  // Tool 6: get_next_block_xray
  const xrayMeta = MCP_TOOL_METADATA.get_next_block_xray;
  server.registerTool(
    'get_next_block_xray',
    {
      title: xrayMeta.title,
      description: xrayMeta.description,
      annotations: xrayMeta.annotations,
      outputSchema: xrayMeta.outputSchema,
      inputSchema: {
        txid: z.string().length(64).optional().describe('Optional 64-character hex Bitcoin transaction ID to inspect for inclusion rank'),
      },
    },
    async ({ txid }) => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: No Lightning payer configured on this agent.' }],
          };
        }

        const url = txid
          ? `${sovereignNodeUrl}/v1/chain/btc/next-block-xray?txid=${txid}`
          : `${sovereignNodeUrl}/v1/chain/btc/next-block-xray`;

        const data = await agent.fetch(url, { maxPriceSatsAllowed: maxPriceSats });
        return toStructuredResult(data);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to inspect next-block template: ${error.message}` }],
        };
      }
    }
  );

  // Tool 7: simulate_raw_transaction
  const simRawMeta = MCP_TOOL_METADATA.simulate_raw_transaction;
  server.registerTool(
    'simulate_raw_transaction',
    {
      title: simRawMeta.title,
      description: simRawMeta.description,
      annotations: simRawMeta.annotations,
      outputSchema: simRawMeta.outputSchema,
      inputSchema: {
        rawTxHex: z.string().describe('Hexadecimal signed raw Bitcoin transaction to simulate against consensus rules'),
      },
    },
    async ({ rawTxHex }) => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: No Lightning payer configured on this agent.' }],
          };
        }

        const data = await agent.fetch(`${sovereignNodeUrl}/v1/chain/btc/simulate-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawTxHex }),
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(data);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to simulate transaction: ${error.message}` }],
        };
      }
    }
  );

  // Tool 8: inspect_eip7702_authorization
  const eip7702Meta = MCP_TOOL_METADATA.inspect_eip7702_authorization;
  server.registerTool(
    'inspect_eip7702_authorization',
    {
      title: eip7702Meta.title,
      description: eip7702Meta.description,
      annotations: eip7702Meta.annotations,
      outputSchema: eip7702Meta.outputSchema,
      inputSchema: {
        executionChainId: z.number().int().positive().optional().describe('Optional target EVM execution chain ID (e.g. 1, 8453, 42161)'),
        authorizationList: z
          .array(
            z.object({
              chainId: z.union([z.number().int().nonnegative(), z.string()]).describe('EIP-7702 authorization chainId (0 = wildcard cross-chain replay risk)'),
              address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Target delegation contract address'),
              nonce: z.union([z.number().int().nonnegative(), z.string()]).describe('Account nonce for the authorization'),
              bytecode: z.string().optional().describe('Optional pre-fetched EVM bytecode hex (0x...)'),
            })
          )
          .min(1)
          .max(50)
          .describe('EIP-7702 authorization_list entries to scan'),
      },
    },
    async ({ executionChainId, authorizationList }) => {
      try {
        if (!agent) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: No Lightning payer configured on this agent.' }],
          };
        }

        const data = await agent.fetch(`${sovereignNodeUrl}/v1/chain/evm/eip7702-shield`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executionChainId, authorizationList }),
          maxPriceSatsAllowed: maxPriceSats,
        });

        return toStructuredResult(data);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to inspect EIP-7702 authorization: ${error.message}` }],
        };
      }
    }
  );

  // Tools 9-11: EVM Pre-Sign Simulation, Address Safety & Cryptographically Signed Preflight Guard
  registerStdioSecurityMcpTools(server, sovereignNodeUrl, agent, maxPriceSats);

  const start = async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Sovereign MCP Server] 🚀 Connected via stdio transport.');
  };

  return { server, start };
}
