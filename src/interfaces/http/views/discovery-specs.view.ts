/**
 * Machine-Readable Discovery Specifications for Sovereign Node Engine (node.sovroute.com)
 * Includes:
 * 1. /llms.txt — AI Agent & LLM Discovery Manifest + One-Click MCP Setup
 * 2. /openapi.json — OpenAPI 3.1.0 Specification with TaskFuel x-payment-info
 * 3. /mcp-config.json — Ready-to-use Model Context Protocol (MCP) configuration
 */

export function renderLlmsTxt(): string {
  return `# Sovereign Node Engine (node.sovroute.com)

Sovereign Node Engine — Bare-Metal Bitcoin Core v31.1 & Lightning Network Triple-Rail Intelligence Oracle

Sovereign Node Engine provides cryptographic, zero-trust Bitcoin Mainnet mempool forensics, 0-Confirmation Replace-By-Fee (RBF) double-spend fraud detection, EIP-7702 authorization security inspection, and smart fee projections directly from a dedicated bare-metal Bitcoin Core v31.1 fullnode and Phoenixd/LND gateway.

## Triple-Rail HTTP 402 & MPP Payment Architecture
Every endpoint supports instant, accountless pay-per-call settlement over three native machine payment standards simultaneously:
1. **Native Lightning Network (L402):** Pay the BOLT-11 invoice returned in \`WWW-Authenticate: L402 macaroon="...", invoice="lnbc..."\` (or via Alby Hub NWC NIP-47) and resend with \`Authorization: L402 <macaroon>:<preimage>\`.
2. **Base L2 USDC (x402 v2):** Sign an EIP-3009 USDC authorization on Base Mainnet (\`eip155:8453\`, asset \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\`) to \`0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784\` using the \`Payment-Required\` header and resend with \`Payment-Signature: <base64_payload>\`.
3. **Machine Payments Protocol (MPP):** Send \`Authorization: Payment <credential>\` conforming to IETF draft-lightning-charge-00 (preimage / payment hash) or draft-usdc-charge-00 (signed EIP-3009 transfer). Server responds with \`Payment-Request\` challenge and returns \`Payment-Receipt\` upon settlement.

## Production Capability Endpoints (https://node.sovroute.com)
- \`POST /v1/chain/evm/eip7702-shield\` (5 sats L402 / $0.005 Base USDC):
  **EIP-7702 AuthTx Security Scanner** (Tool: \`inspect_eip7702_authorization\`) — Inspects Pectra \`authorization_list\` delegations for wallet drainer bytecode (\`SELFDESTRUCT\`, unverified \`DELEGATECALL\`, ERC-20 \`transferFrom\`/\`approve\` selectors), audited smart account standards, and cross-chain replay risk (\`chainId=0\`). Returns \`SAFE_VERIFIED\`, \`SUSPICIOUS_UNVERIFIED\`, or \`CRITICAL_DRAIN_RISK\`.
- \`GET /v1/chain/btc/next-block-xray\` & \`GET /v1/chain/btc/next-block-xray/:txid\` (5 sats L402 / $0.005 Base USDC):
  **Live Next-Block Miner Template X-Ray** (Tool: \`get_next_block_xray\`) — Queries \`getblocktemplate\` on bare-metal Bitcoin Core v31.1 to reveal the exact ~3,000–4,000 transactions selected for the next block, cutoff fee rate (\`cutoffFeeRateSatPerVb\`), block fill %, top whale fees, and exact queue rank (\`rankInBlock\`, \`GUARANTEED_NEXT_BLOCK\` vs \`QUEUED_FOR_LATER_BLOCK\`) for any \`txid\`.
- \`POST /v1/chain/btc/simulate-tx\` (5 sats L402 / $0.005 Base USDC):
  **Zero-Broadcast Consensus & Script Dry-Run Simulator** (Tool: \`simulate_raw_transaction\`) — Runs \`testmempoolaccept\` + \`decoderawtransaction\` against live Bitcoin Core v31.1 UTXO set with **0% P2P network broadcast** (\`broadcastedToNetwork: false\`). Validates scripts, Taproot/SegWit witness, and BIP-125 RBF signaling before an agent ever broadcasts to the public network.
- \`GET /v1/chain/btc/rbf-shield/:txid\` (5 sats L402 / $0.005 Base USDC):
  **0-Conf RBF Double-Spend Fraud Shield** (Tool: \`check_rbf_fraud_shield\`) — Industry-first zero-confirmation security oracle. Inspects any 64-char hex Bitcoin transaction ID in the live mempool and UTXO set. Detects BIP-125 replaceability signaling, active conflicting spends (\`spentby\`), unconfirmed ancestor chain depth (\`ancestorCount\`), effective package fee rate (\`feeRateSatPerVb\`), or existing block confirmations (\`confirmations\`). Returns actionable verdict (\`SAFE\`, \`MEDIUM_RISK\`, \`HIGH_RISK_RBF_ENABLED\`, \`NOT_FOUND\`).
- \`POST /v1/chain/evm/bytecode-risk-ml\` (5 sats L402 / $0.005 Base USDC):
  **PyTorch ONNX Neural Bytecode Risk Classifier** — Scores raw EVM bytecode or on-chain contract addresses (\`chainId\` + \`address\`) using an in-memory ONNX neural network trained on audited vs drainer bytecode patterns (\`BENIGN_PATTERN\`, \`SUSPICIOUS_ML\`, \`DRAINER_ML_DETECTED\`).
- \`POST /v1/omni/pay-lightning\` (25 sats / $0.025 via Solana, Base, Arbitrum, or L402):
  **SUB-LIG Walletless Cross-Chain Lightning Bridge** (Tool: \`pay_lightning_invoice\`) — AI agents with only Solana (\`SOL\`/\`USDC\`) or EVM (\`Base\`/\`Arbitrum\`/\`USDC\`/\`ETH\`) wallets pay via Quad-Rail and pass \`{"invoice": "lnbc..."}\` (up to 25 sats); Sovereign Node Engine instantly settles the BOLT-11 invoice over Phoenixd and returns the cryptographic \`paymentPreimage\`.
- \`GET /v1/intel/microstructure?symbol=BTC|ETH|SOL\` (5 sats L402 / $0.005 Base USDC):
  **Zero-Wait 4-Exchange Microstructure Oracle** — In-memory public WebSocket streams from Binance, Bybit, OKX, and Hyperliquid returning orderbook imbalance, cross-exchange spread (bps), 1m/5m CVD, funding rates, and liquidation cascade score.
- \`GET /v1/intel/polymarket-edge?asset=BTC|ETH|SOL\` (5 sats L402 / $0.005 Base USDC):
  **Live Polymarket CLOB vs Spot Edge** — Real-time Polymarket CLOB orderbook probabilities and Gamma 24h volume paired with live 4-exchange spot price and orderbook imbalance.
- \`GET /v1/intel/funding-arb?symbol=BTC|ETH|SOL\` (5 sats L402 / $0.005 Base USDC):
  **Cross-Exchange Funding Carry & Spot-Perp Basis** — Live 8h funding rates (bps + APR) and spot-perp basis across Binance, Bybit, and OKX.
- \`GET /v1/intel/options-skew?asset=BTC|ETH\` (5 sats L402 / $0.005 Base USDC):
  **Deribit DVOL & Options Skew Oracle** — Real-time Deribit DVOL volatility index, market regime, ATM IV, OTM put-call skew, and open interest ratio.
- \`GET /v1/intel/stablecoin-peg?symbol=USDC|USDT|USDE|DAI\` (1 sat L402 / $0.001 Base USDC):
  **Zero-Wait Stablecoin Peg & Depeg Oracle** — Multi-venue USD peg tracker across Kraken, Coinbase and Binance Spot WebSockets with signed bps deviation and depeg risk score (0-100).
- \`GET /v1/chain/evm/gas-pulse?chain=ethereum|base|arbitrum\` (1 sat L402 / $0.001 Base USDC):
  **Zero-Wait EVM Gas & EIP-4844 Blob Pulse** — Real-time \`newHeads\` WebSocket tracker across Ethereum, Base and Arbitrum reporting baseFeeGwei, blobBaseFeeGwei, gas utilization and trend.
- \`GET /v1/chain/btc/whale-tape?minBtc=10&limit=25\` (5 sats L402 / $0.005 Base USDC):
  **Bare-Metal ZMQ rawtx Whale Tape** — Subscribes directly to local Bitcoin Core v31.1 \`zmqpubrawtx\` stream and indexes unconfirmed whale transactions (\`>= 10 BTC\` default) over a 24h rolling window.
- \`GET /v1/chain/btc/mempool\` (1 sat L402 / $0.001 Base USDC):
  **Deep Mempool Entropy & Congestion Engine** (Tool: \`get_mempool_entropy\`) — Extracts live unconfirmed transaction count (\`txCount\`), virtual backlog size in bytes (\`vsizeBytes\`), total pending miner fee pool in satoshis (\`totalFeeSats\`), floor/median/fastest fee tiers backed by \`estimatesmartfee\`, and dynamic network congestion level (\`LOW\`, \`MODERATE\`, \`HIGH\`, \`EXTREME\`).
- \`GET /v1/chain/btc/fees\` (1 sat L402 / $0.001 Base USDC):
  **Bitcoin Core Smart Fee Projections** (Tool: \`get_bitcoin_smart_fees\`) — Real-time \`estimatesmartfee\` projections (\`fastestSatPerVb\` for 1-2 blocks, \`halfHourSatPerVb\`, \`hourSatPerVb\`, \`economicSatPerVb\` for 6 blocks).
- \`GET /v1/chain/btc/block\` (1 sat L402 / $0.001 Base USDC):
  **Verified Block Header Truth** (Tool: \`verify_block_header\`) — Latest synchronized Bitcoin Mainnet block height, block hash, difficulty, timestamp, and bits directly from bare-metal Bitcoin Core v31.1.
- \`GET /health\` (Free / 0 sats):
  Public node health and synchronization telemetry.

## Official Model Context Protocol (MCP) Tools Provided
The following deterministic tools are packaged in the official MCP server:
1. \`inspect_eip7702_authorization\`: Audits EIP-7702 authorization delegations against drainer patterns and replay risks.
2. \`check_rbf_fraud_shield\`: 0-conf double spend analysis with BIP-125 replacement detection and ancestor feerate calculation.
3. \`get_next_block_xray\`: Real-time block template inspection predicting transaction inclusion in the very next block.
4. \`simulate_raw_transaction\`: Dry-runs Bitcoin transactions against Bitcoin Core v31.1 with zero P2P broadcast risk.
5. \`get_bitcoin_smart_fees\`: High-precision mempool fee tier estimator.
6. \`get_mempool_entropy\`: In-depth mempool queue statistics and congestion level.
7. \`verify_block_header\`: Cryptographic verification of latest Bitcoin Mainnet block.
8. \`pay_lightning_invoice\`: Cross-chain Lightning micropayment bridge.

## Remote Streamable HTTP MCP (Zero-Setup Evaluation — CrewAI 1.x / Claude / Cursor)
Connect directly without installing a local package or configuring a wallet (15 free evaluation tool calls/24h per IP, then pay-per-call via L402 Lightning 1-5 sats, x402 Base USDC \$0.001-\$0.005, or MPP):
- **Endpoint:** \`https://node.sovroute.com/mcp\` (Transport: \`streamable-http\`)
- **CrewAI 1.x Native DSL:** \`Agent(..., mcps=["https://node.sovroute.com/mcp"])\`

## MCP Integration Options (Claude Desktop / Cursor / Windsurf)

### Option 1: Remote Streamable HTTP (Recommended — No Local Dependency)
\`\`\`json
{
  "mcpServers": {
    "sovereign-node-remote": {
      "url": "https://node.sovroute.com/mcp"
    }
  }
}
\`\`\`

### Option 2: Production Stdio Package (npm @aipp/sovereign-node-mcp)
\`\`\`json
{
  "mcpServers": {
    "sovereign-node-engine": {
      "command": "npx",
      "args": ["-y", "@aipp/sovereign-node-mcp"],
      "env": {
        "SOVEREIGN_NODE_URL": "https://node.sovroute.com",
        "ALBY_NWC_URL": "nostr+walletconnect://YOUR_ALBY_HUB_NWC_SECRET",
        "MAX_PRICE_SATS_ALLOWED": "10"
      }
    }
  }
}
\`\`\`

## Discovery & Cross-Protocol Links
- Node Gateway: https://node.sovroute.com
- Full Forensics llms.txt: https://node.sovroute.com/llms.txt
- OpenAPI 3.1 Spec: https://node.sovroute.com/openapi.json
- MCP Config Template: https://node.sovroute.com/mcp-config.json
- Main SovRoute Gateway: https://sovroute.com
- Main SovRoute llms.txt: https://sovroute.com/llms.txt
- Contact: contact@sovroute.com
`;
}

export function renderMcpConfigJson(): Record<string, unknown> {
  return {
    remoteStreamableHttp: {
      url: 'https://node.sovroute.com/mcp',
      transport: 'streamable-http',
      crewaiNativeDsl: 'https://node.sovroute.com/mcp',
      freeEvaluationCallsPerDay: 15,
      paymentProtocol: 'Triple-Rail: L402 Lightning (1-5 sats), x402 Base USDC ($0.001-$0.005), and MPP (draft-lightning-charge-00 / draft-usdc-charge-00)',
    },
    mcpServers: {
      'sovereign-node-engine': {
        command: 'npx',
        args: ['-y', '@aipp/sovereign-node-mcp'],
        env: {
          SOVEREIGN_NODE_URL: 'https://node.sovroute.com',
          ALBY_NWC_URL: 'nostr+walletconnect://YOUR_ALBY_HUB_NWC_SECRET',
          MAX_PRICE_SATS_ALLOWED: '10',
        },
      },
      'sovereign-node-remote': {
        url: 'https://node.sovroute.com/mcp',
      },
    },
    toolsProvided: [
      'inspect_eip7702_authorization',
      'get_next_block_xray',
      'simulate_raw_transaction',
      'check_rbf_fraud_shield',
      'get_bitcoin_smart_fees',
      'get_mempool_entropy',
      'verify_block_header',
      'pay_lightning_invoice',
    ],
  };
}

export function renderX402Manifest(): Record<string, unknown> {
  return {
    x402Version: 2,
    name: 'Sovereign Node Engine',
    description:
      'Bare-metal Bitcoin Core v31.1 & Lightning Network mempool forensics, 0-conf RBF double-spend fraud detection, next-block miner candidate templates, and zero-broadcast consensus simulation.',
    homepage: 'https://node.sovroute.com',
    payTo: '0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784',
    network: 'base',
    networkIdentifier: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    facilitatorUrl: 'https://facilitator.payai.network',
    circleGatewayFacilitatorUrl: 'https://gateway-api.circle.com/v1/x402',
    services: [
      {
        id: 'btc-next-block-xray',
        name: 'Live Next-Block Miner Template X-Ray',
        path: '/v1/chain/btc/next-block-xray',
        method: 'GET',
        description:
          'Queries getblocktemplate on bare-metal Bitcoin Core v31.1 to reveal the exact ~3,500 transactions selected for the next block, cutoff fee rate, and queue ranking.',
        price: '0.005',
        unit: 'USDC',
        extensions: {
          bazaar: {
            discoverable: true,
            category: 'blockchain-forensics',
          },
        },
      },
      {
        id: 'btc-simulate-tx',
        name: 'Zero-Broadcast Consensus & Script Dry-Run Simulator',
        path: '/v1/chain/btc/simulate-tx',
        method: 'POST',
        description:
          'Runs testmempoolaccept + decoderawtransaction against live Bitcoin Core v31.1 UTXO set with 0% P2P network broadcast.',
        price: '0.005',
        unit: 'USDC',
        extensions: {
          bazaar: {
            discoverable: true,
            category: 'blockchain-forensics',
          },
        },
      },
      {
        id: 'btc-rbf-shield',
        name: '0-Conf RBF Double-Spend Fraud Shield',
        path: '/v1/chain/btc/rbf-shield/:txid',
        method: 'GET',
        description:
          'Inspects Bitcoin txid in live mempool for BIP-125 replaceability signaling, active conflicting spends, ancestor depth, and package fee rate.',
        price: '0.005',
        unit: 'USDC',
        extensions: {
          bazaar: {
            discoverable: true,
            category: 'blockchain-forensics',
          },
        },
      },
      {
        id: 'evm-eip7702-shield',
        name: 'EIP-7702 AuthTx Security Scanner',
        path: '/v1/chain/evm/eip7702-shield',
        method: 'POST',
        description:
          'Inspects Pectra authorization_list delegations for wallet drainer bytecode, audited smart account standards, and cross-chain replay risk.',
        price: '0.005',
        unit: 'USDC',
        extensions: {
          bazaar: {
            discoverable: true,
            category: 'security',
          },
        },
      },
      {
        id: 'btc-mempool',
        name: 'Deep Mempool Entropy & Congestion Engine',
        path: '/v1/chain/btc/mempool',
        method: 'GET',
        description:
          'Extracts live unconfirmed tx count, virtual backlog size, total pending miner fee pool, and congestion level.',
        price: '0.001',
        unit: 'USDC',
        extensions: {
          bazaar: {
            discoverable: true,
            category: 'blockchain-forensics',
          },
        },
      },
      {
        id: 'btc-fees',
        name: 'Bitcoin Core Smart Fee Projections',
        path: '/v1/chain/btc/fees',
        method: 'GET',
        description:
          'Real-time estimatesmartfee projections for fastest, half-hour, hour, and economic block targets.',
        price: '0.001',
        unit: 'USDC',
        extensions: {
          bazaar: {
            discoverable: true,
            category: 'blockchain-forensics',
          },
        },
      },
      {
        id: 'btc-block',
        name: 'Verified Block Header Truth',
        path: '/v1/chain/btc/block',
        method: 'GET',
        description:
          'Latest synchronized Bitcoin Mainnet block height, block hash, difficulty, timestamp, previous block hash, merkle root, and bits directly from bare-metal Bitcoin Core v31.1.',
        price: '0.001',
        unit: 'USDC',
        extensions: {
          bazaar: {
            discoverable: true,
            category: 'blockchain-forensics',
          },
        },
      },
    ],
  };
}

export { renderOpenApiSpec } from './openapi-spec.view.js';
