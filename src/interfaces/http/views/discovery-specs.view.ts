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
- \`GET /v1/chain/btc/next-block-xray\` & \`GET /v1/chain/btc/next-block-xray/:txid\` (3 sats L402 / $0.003 Base USDC):
  **Live Next-Block Miner Template X-Ray** — Queries \`getblocktemplate\` on bare-metal Bitcoin Core v31.1 to reveal the exact ~3,000–4,000 transactions selected for the next block, cutoff fee rate (\`cutoffFeeRateSatPerVb\`), block fill %, top whale fees, and exact queue rank (\`rankInBlock\`, \`GUARANTEED_NEXT_BLOCK\` vs \`QUEUED_FOR_LATER_BLOCK\`) for any \`txid\`.
- \`POST /v1/chain/btc/simulate-tx\` (5 sats L402 / $0.005 Base USDC):
  **Zero-Broadcast Consensus & Script Dry-Run Simulator** — Runs \`testmempoolaccept\` + \`decoderawtransaction\` against live Bitcoin Core v31.1 UTXO set with **0% P2P network broadcast** (\`broadcastedToNetwork: false\`). Validates scripts, Taproot/SegWit witness, and BIP-125 RBF signaling before an agent ever broadcasts to the public network.
- \`POST /v1/omni/pay-lightning\` (25 sats / $0.025 via Solana, Base, Arbitrum, or L402):
  **SUB-LIG Walletless Cross-Chain Lightning Bridge** — AI agents with only Solana (\`SOL\`/\`USDC\`) or EVM (\`Base\`/\`Arbitrum\`/\`USDC\`/\`ETH\`) wallets pay via Quad-Rail and pass \`{"invoice": "lnbc..."}\` (up to 25 sats); Sovereign Node Engine instantly settles the BOLT-11 invoice over Phoenixd and returns the cryptographic \`paymentPreimage\`.
- \`GET /v1/chain/btc/rbf-shield/:txid\` (5 sats L402 / $0.005 Base USDC):
  **0-Conf RBF Double-Spend Fraud Shield** — Industry-first zero-confirmation security oracle. Inspects any 64-char hex Bitcoin transaction ID in the live mempool and UTXO set. Detects BIP-125 replaceability signaling, active conflicting spends (\`spentby\`), unconfirmed ancestor chain depth (\`ancestorCount\`), effective package fee rate (\`feeRateSatPerVb\`), or existing block confirmations (\`confirmations\`). Returns actionable verdict (\`SAFE\`, \`MEDIUM_RISK\`, \`HIGH_RISK_RBF_ENABLED\`, \`NOT_FOUND\`).
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

export { renderOpenApiSpec } from './openapi-spec.view.js';
