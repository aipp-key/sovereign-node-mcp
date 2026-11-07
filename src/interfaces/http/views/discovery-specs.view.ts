/**
 * Machine-Readable Discovery Specifications for Sovereign Node Engine (node.sovroute.com)
 * Includes:
 * 1. /llms.txt — AI Agent & LLM Discovery Manifest + One-Click MCP Setup
 * 2. /openapi.json — OpenAPI 3.1.0 Specification with TaskFuel x-payment-info
 * 3. /mcp-config.json — Ready-to-use Model Context Protocol (MCP) configuration
 */

export function renderLlmsTxt(): string {
  return `# Sovereign Node Engine (node.sovroute.com)

Sovereign Node Engine — Bare-Metal Bitcoin Core v31.1 & Lightning Network Dual-Rail Intelligence Oracle

Sovereign Node Engine provides cryptographic, zero-trust Bitcoin Mainnet mempool forensics, 0-Confirmation Replace-By-Fee (RBF) double-spend fraud detection, and smart fee projections directly from a dedicated bare-metal Bitcoin Core v31.1 fullnode and Phoenixd/LND gateway.

## Dual-Rail HTTP 402 Payment Architecture
Every endpoint supports instant, accountless pay-per-call settlement over two native rails simultaneously:
1. **Native Lightning Network (L402):** Pay the BOLT-11 invoice returned in \`WWW-Authenticate: L402 macaroon="...", invoice="lnbc..."\` (or via Alby Hub NWC NIP-47) and resend with \`Authorization: L402 <macaroon>:<preimage>\`.
2. **Base L2 USDC (x402 v2):** Sign an EIP-3009 USDC authorization on Base Mainnet (\`eip155:8453\`, asset \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\`) to \`0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784\` using the \`Payment-Required\` header and resend with \`Payment-Signature: <base64_payload>\`.

## Production Capability Endpoints (https://node.sovroute.com)
- \`GET /v1/chain/btc/rbf-shield/:txid\` (5 sats L402 / $0.005 Base USDC):
  **0-Conf RBF Double-Spend Fraud Shield** — Industry-first zero-confirmation security oracle. Inspects any 64-char hex Bitcoin transaction ID in the live mempool and UTXO set. Detects BIP-125 replaceability signaling, active conflicting spends (\`spentby\`), unconfirmed ancestor chain depth (\`ancestorCount\`), effective package fee rate (\`feeRateSatPerVb\`), or existing block confirmations (\`confirmations\`). Returns actionable verdict (\`SAFE\`, \`MEDIUM_RISK\`, \`HIGH_RISK_RBF_ENABLED\`, \`NOT_FOUND\`). Invalid txids return \`400 Bad Request\` prior to any payment challenge.
- \`GET /v1/chain/btc/mempool\` (2 sats L402 / $0.002 Base USDC):
  **Deep Mempool Entropy & Congestion Engine** — Extracts live unconfirmed transaction count (\`txCount\`), virtual backlog size in bytes (\`vsizeBytes\`), total pending miner fee pool in satoshis (\`totalFeeSats\`), floor/median/fastest fee tiers backed by \`estimatesmartfee\`, and dynamic network congestion level (\`LOW\`, \`MODERATE\`, \`HIGH\`, \`EXTREME\`).
- \`GET /v1/chain/btc/fees\` (1 sat L402 / $0.001 Base USDC):
  **Bitcoin Core Smart Fee Projections** — Real-time \`estimatesmartfee\` projections (\`fastestSatPerVb\` for 1-2 blocks, \`halfHourSatPerVb\`, \`hourSatPerVb\`, \`economicSatPerVb\` for 6 blocks).
- \`GET /v1/chain/btc/block\` (1 sat L402 / $0.001 Base USDC):
  **Verified Block Header Truth** — Latest synchronized Bitcoin Mainnet block height, block hash, difficulty, timestamp, and bits directly from bare-metal Bitcoin Core v31.1.
- \`GET /health\` (Free / 0 sats):
  Public node health and synchronization telemetry.

## One-Click MCP Integration (Claude Desktop / Cursor / Windsurf)
Add Sovereign Node Engine to your AI agent's \`mcp_config.json\` / \`claude_desktop_config.json\`:
\`\`\`json
{
  "mcpServers": {
    "sovereign-node-engine": {
      "command": "npx",
      "args": ["-y", "tsx", "src/interfaces/mcp/index.ts"],
      "env": {
        "SOVEREIGN_NODE_URL": "https://node.sovroute.com",
        "ALBY_NWC_URL": "nostr+walletconnect://YOUR_ALBY_HUB_NWC_SECRET",
        "MAX_PRICE_SATS_ALLOWED": "10"
      }
    }
  }
}
\`\`\`

## Discovery & Links
- Node Gateway: https://node.sovroute.com
- OpenAPI 3.1 Spec: https://node.sovroute.com/openapi.json
- MCP Config Template: https://node.sovroute.com/mcp-config.json
- Main SovRoute Gateway: https://sovroute.com
- Contact: contact@sovroute.com
`;
}

export function renderMcpConfigJson(): Record<string, unknown> {
  return {
    mcpServers: {
      'sovereign-node-engine': {
        command: 'npx',
        args: ['-y', 'tsx', 'src/interfaces/mcp/index.ts'],
        env: {
          SOVEREIGN_NODE_URL: 'https://node.sovroute.com',
          ALBY_NWC_URL: 'nostr+walletconnect://YOUR_ALBY_HUB_NWC_SECRET',
          MAX_PRICE_SATS_ALLOWED: '10',
        },
      },
    },
    toolsProvided: [
      'check_rbf_fraud_shield',
      'get_mempool_entropy',
      'get_bitcoin_smart_fees',
      'verify_block_header',
      'pay_lightning_invoice',
    ],
  };
}

export function renderOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Sovereign Node Engine — Bare-Metal Bitcoin Core v31.1 & Dual-Rail (L402 + x402) Oracle',
      version: '1.0.0',
      summary:
        '0-Conf RBF Double-Spend Fraud Shield, Deep Mempool Entropy, and Smart Fee Projections via Native Lightning (L402) & Base USDC (x402).',
      description:
        'Zero-trust Bitcoin Mainnet intelligence extracted directly from bare-metal Bitcoin Core v31.1 with 0.04ms in-memory caching. Supports Dual-Rail HTTP 402 settlement: pay in satoshis over Lightning Network (L402) or in USDC on Base L2 (x402).',
      contact: {
        email: 'contact@sovroute.com',
        url: 'https://node.sovroute.com',
      },
    },
    servers: [
      {
        url: 'https://node.sovroute.com',
        description: 'Sovereign Node Engine Production Gateway (Dual-Rail L402 + x402)',
      },
    ],
    paths: {
      '/v1/chain/btc/rbf-shield/{txid}': {
        get: {
          operationId: 'checkRbfFraudShield',
          summary: '0-Conf BIP-125 RBF Double-Spend Fraud Shield',
          description:
            'Inspects an unconfirmed or recently mined Bitcoin transaction (64-char hex txid) directly against bare-metal Bitcoin Core v31.1 mempool and UTXO set. Detects BIP-125 replaceability signaling, active double-spend conflicts, unconfirmed ancestor chain depth, effective package fee rate, and block confirmations. Invalid txid formats return 400 Bad Request before any payment challenge. Price: 5 sats (L402 Lightning) or $0.005 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          parameters: [
            {
              name: 'txid',
              in: 'path',
              required: true,
              description: '64-character hexadecimal Bitcoin transaction ID',
              schema: {
                type: 'string',
                pattern: '^[0-9a-fA-F]{64}$',
              },
            },
          ],
          'x-payment-info': {
            protocols: [{ x402: {} }, { l402: {} }],
            pricingMode: 'fixed',
            networks: ['base', 'lightning'],
            price: {
              mode: 'fixed',
              currency: 'USD',
              amount: '0.005',
              priceSats: 5,
            },
          },
          responses: {
            '200': {
              description: '0-Conf RBF fraud shield assessment',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      source: { type: 'string', example: 'sovereign-bitcoind:31.1 (Full-RBF Mempool Inspector)' },
                      paymentRail: { type: 'string', example: 'L402-LIGHTNING' },
                      verification: { type: 'string', example: 'Cryptographic Dual-Rail Access' },
                      data: {
                        type: 'object',
                        properties: {
                          txid: { type: 'string' },
                          isInMempool: { type: 'boolean', example: true },
                          confirmations: { type: 'integer', example: 0 },
                          bip125Replaceable: { type: 'boolean', example: true },
                          vsize: { type: 'integer', example: 141 },
                          feeRateSatPerVb: { type: 'number', example: 12.5 },
                          ancestorCount: { type: 'integer', example: 1 },
                          hasConflicts: { type: 'boolean', example: false },
                          zeroConfRiskLevel: {
                            type: 'string',
                            enum: ['SAFE', 'MEDIUM_RISK', 'HIGH_RISK_RBF_ENABLED', 'NOT_FOUND'],
                          },
                          recommendation: { type: 'string' },
                          updatedAt: { type: 'integer', example: 1794064443 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid 64-character hex transaction ID (checked prior to payment)' },
            '402': { description: 'Dual-Rail Payment Required (L402 Lightning BOLT-11 + Base USDC x402)' },
          },
        },
      },
      '/v1/chain/btc/mempool': {
        get: {
          operationId: 'getMempoolEntropy',
          summary: 'Deep Mempool Entropy & Congestion Engine',
          description:
            'Returns real-time Bitcoin mempool depth from bare-metal Bitcoin Core v31.1: unconfirmed txCount, virtual backlog size in bytes (vsizeBytes), total pending miner fee pool in satoshis (totalFeeSats), floor/median/fastest fee rates (sat/vB), and dynamic congestion rating (LOW, MODERATE, HIGH, EXTREME). Price: 2 sats (L402 Lightning) or $0.002 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          'x-payment-info': {
            protocols: [{ x402: {} }, { l402: {} }],
            pricingMode: 'fixed',
            networks: ['base', 'lightning'],
            price: {
              mode: 'fixed',
              currency: 'USD',
              amount: '0.002',
              priceSats: 2,
            },
          },
          responses: {
            '200': {
              description: 'Deep mempool entropy and congestion state',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      source: { type: 'string', example: 'sovereign-bitcoind:31.1 (Mainnet)' },
                      paymentRail: { type: 'string', example: 'L402-LIGHTNING' },
                      verification: { type: 'string', example: 'Cryptographic Dual-Rail Access' },
                      data: {
                        type: 'object',
                        properties: {
                          txCount: { type: 'integer', example: 56860 },
                          vsizeBytes: { type: 'integer', example: 13250000 },
                          totalFeeSats: { type: 'integer', example: 4188995 },
                          minFeeRateSatPerVb: { type: 'number', example: 0.1 },
                          medianFeeRateSatPerVb: { type: 'number', example: 1.07 },
                          fastFeeRateSatPerVb: { type: 'number', example: 2.11 },
                          congestionLevel: {
                            type: 'string',
                            enum: ['LOW', 'MODERATE', 'HIGH', 'EXTREME'],
                          },
                          updatedAt: { type: 'integer', example: 1794064443 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '402': { description: 'Dual-Rail Payment Required (L402 Lightning BOLT-11 + Base USDC x402)' },
          },
        },
      },
      '/v1/chain/btc/fees': {
        get: {
          operationId: 'getSmartFeeProjections',
          summary: 'Bitcoin Core v31.1 Smart Fee Projections',
          description:
            'Real-time estimatesmartfee projections in sat/vB for 1-2 block (fastest) and 6 block (economic) confirmation targets. Price: 1 sat (L402 Lightning) or $0.001 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          'x-payment-info': {
            protocols: [{ x402: {} }, { l402: {} }],
            pricingMode: 'fixed',
            networks: ['base', 'lightning'],
            price: {
              mode: 'fixed',
              currency: 'USD',
              amount: '0.001',
              priceSats: 1,
            },
          },
          responses: {
            '200': { description: 'Smart fee rate projections in sat/vB' },
            '402': { description: 'Dual-Rail Payment Required (L402 Lightning BOLT-11 + Base USDC x402)' },
          },
        },
      },
      '/v1/chain/btc/block': {
        get: {
          operationId: 'getBlockHeaderTruth',
          summary: 'Verified Bitcoin Mainnet Block Header Truth',
          description:
            'Returns latest verified block height, hash, difficulty, timestamp, and bits directly from bare-metal Bitcoin Core v31.1. Price: 1 sat (L402 Lightning) or $0.001 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          'x-payment-info': {
            protocols: [{ x402: {} }, { l402: {} }],
            pricingMode: 'fixed',
            networks: ['base', 'lightning'],
            price: {
              mode: 'fixed',
              currency: 'USD',
              amount: '0.001',
              priceSats: 1,
            },
          },
          responses: {
            '200': { description: 'Verified block header state' },
            '402': { description: 'Dual-Rail Payment Required (L402 Lightning BOLT-11 + Base USDC x402)' },
          },
        },
      },
    },
  };
}
