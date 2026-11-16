# @aipp/sovereign-node-mcp

[![npm version](https://img.shields.io/npm/v/@aipp/sovereign-node-mcp.svg?color=orange)](https://www.npmjs.com/package/@aipp/sovereign-node-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP Compliant](https://img.shields.io/badge/Model_Context_Protocol-Verified-green.svg)](https://modelcontextprotocol.io)

> **Zero-Trust Bitcoin Core v31.1 Intelligence, 0-Conf RBF Forensics, and Consensus Simulation for AI Agents.**  
> Built for Anthropic Claude Desktop, Cursor IDE, Windsurf, LangChain, and autonomous agents. Connects directly to bare-metal Bitcoin Mainnet with **~0.04ms in-memory cache latency** and native **Dual-Rail (L402 Lightning + Base USDC x402)** micro-settlement.

---

## ⚡ Quick Start

You can run the Sovereign Node MCP server directly via `npx` — zero installation required, fully native and vendor-direct.

### 1. Claude Desktop Setup
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sovereign-node": {
      "command": "npx",
      "args": ["-y", "@aipp/sovereign-node-mcp"],
      "env": {
        "SOVEREIGN_NODE_URL": "https://node.sovroute.com",
        "ALBY_NWC_URL": "nostr+walletconnect://..."
      }
    }
  }
}
```
*(Note: `ALBY_NWC_URL` or `PHOENIXD_PASSWORD` is optional if your agent autonomously settles L402 pay-per-call queries via satoshis).*

### 2. Cursor IDE Setup
Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sovereign-node": {
      "command": "npx",
      "args": ["-y", "@aipp/sovereign-node-mcp"]
    }
  }
}
```

### 3. Windsurf & Custom Agent Frameworks
Spawn the server directly over `stdio` transport:

```bash
npx -y @aipp/sovereign-node-mcp
```

---

## 🛠️ Available MCP Tools

| Tool | Category | Price | Description |
| :--- | :--- | :--- | :--- |
| `get_next_block_xray` | Forensics | 3 sats / $0.003 | Inspects live `getblocktemplate` candidate block. Reveals cutoff fee rate (sat/vB), block fill %, and exact queue rank (`GUARANTEED_NEXT_BLOCK` vs `QUEUED_FOR_LATER`). |
| `simulate_raw_transaction` | Simulation | 5 sats / $0.005 | Zero-broadcast dry-run consensus validator (`testmempoolaccept`). Simulates scripts & UTXO rules with **0% P2P network broadcast**. |
| `check_rbf_fraud_shield` | Security | 5 sats / $0.005 | 0-Conf RBF double-spend fraud shield. Inspects BIP-125 signaling, unconfirmed ancestor chains, and conflicting spends. |
| `get_bitcoin_smart_fees` | Fee Oracle | 1 sat / $0.001 | Real-time `estimatesmartfee` projections (sat/vB) for fastest (1–2 blocks) and economic (6 blocks) confirmation targets. |
| `get_mempool_entropy` | Network State | 2 sats / $0.002 | Unconfirmed tx count, virtual backlog (vsizeBytes), total fee pool in sats, and dynamic congestion rating. |
| `verify_block_header` | Chain Truth | 1 sat / $0.001 | Latest verified Bitcoin Mainnet tip height, block hash, difficulty, and timestamp from bare-metal Core v31.1. |
| `pay_lightning_invoice` | Settlement | Free tool | Autonomously pays any BOLT-11 invoice via your configured Lightning wallet and returns cryptographic preimage. |

---

## 🏛️ Architecture & Verification

* **Live Node Gateway:** `https://node.sovroute.com`
* **Machine-Readable OpenAPI 3.1 Spec:** `https://node.sovroute.com/openapi.json`
* **Agent Context & Guidance:** `https://node.sovroute.com/llms.txt`
* **Circle for Agents Score:** `100/100 Grade A (Runtime-verified)`
* **Satring Directory:** `#1097 [domain verified]`
* **Glama MCP Catalog:** `sovereign-node-mcp [verified & indexed]`
* **Global Agentic Market Exchange:** `Founder #1 [e0bee9b5-8576-44a9-83bb-35981957c9de · Nano $0.008]`

---

## 📄 License
MIT License. Created by [SovRoute](https://sovroute.com) & [aipp](https://aipp.dev).
