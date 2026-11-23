# @aipp/sovereign-node-mcp

[![npm version](https://img.shields.io/npm/v/@aipp/sovereign-node-mcp.svg?color=orange)](https://www.npmjs.com/package/@aipp/sovereign-node-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP Compliant](https://img.shields.io/badge/Model_Context_Protocol-Verified-green.svg)](https://modelcontextprotocol.io)

> **Zero-Trust Bitcoin Core v31.1 & EVM Pre-Sign Security Guardrails with Cryptographically Signed Attestations (`10x SLA Service Credit`) for AI Agents.**  
> Built for Anthropic Claude, Cursor IDE, Windsurf, CrewAI, LangGraph, OpenAI Agents SDK, and Vercel AI SDK. Connects directly to bare-metal Bitcoin Mainnet and EVM execution engines with **~0.04ms in-memory cache latency** and native **Multi-Rail (L402 Lightning + Base & Arc USDC x402 + MPP)** micro-settlement.

---

## ⚡ Quick Start

### Option A: Zero-Setup Remote Streamable HTTP MCP (Recommended)
Connect any Streamable HTTP MCP client directly to `https://node.sovroute.com/mcp` (includes **15 free evaluation calls/24h per IP**):

```python
# CrewAI 1.x One-Liner
Agent(role="Security Analyst", mcps=["https://node.sovroute.com/mcp"])
```

### Option B: Local `npx` Stdio Server
Add this to your `claude_desktop_config.json` or `.cursor/mcp.json`:

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

---

## 🛠️ Available MCP Tools (11 Tools)

| Tool | Category | Price | Description |
| :--- | :--- | :--- | :--- |
| `preflight_transaction_guard` | **Signed Guardrail** | 10 sats / $0.010 | **Flagship:** Unified pre-flight decision guardrail (`ALLOW` / `WARN` / `BLOCK`) across EVM or BTC with **HMAC-SHA256 cryptographic node attestation** and **10x SLA Service Credit**. |
| `simulate_evm_tx` | EVM Security | 5 sats / $0.005 | Dry-runs EVM transactions (`eth_call` + gas), decodes revert reasons, detects unlimited approvals, EIP-7702 targets, and ONNX drainer risk. |
| `inspect_evm_address_safety` | EVM Security | 3 sats / $0.003 | Classifies EVM addresses (EOA, EIP-7702 delegate, EIP-1967 proxy, ERC-20), checks mint/pause/blacklist privileges, `SELFDESTRUCT`, and drainer scores. |
| `inspect_eip7702_authorization` | EVM Pectra | 5 sats / $0.005 | Scans Pectra EIP-7702 `authorization_list` delegations for wallet drainer bytecode, `DELEGATECALL` sweeps, and `chainId=0` cross-chain replay. |
| `get_next_block_xray` | BTC Forensics | 3 sats / $0.003 | Inspects live `getblocktemplate` candidate block. Reveals cutoff fee rate (sat/vB), block fill %, and exact queue rank (`GUARANTEED_NEXT_BLOCK`). |
| `simulate_raw_transaction` | BTC Simulation | 5 sats / $0.005 | Zero-broadcast dry-run consensus validator (`testmempoolaccept`). Simulates scripts & UTXO rules with **0% P2P network broadcast**. |
| `check_rbf_fraud_shield` | BTC Security | 5 sats / $0.005 | 0-Conf RBF double-spend fraud shield. Inspects BIP-125 signaling, unconfirmed ancestor chains, and conflicting spends. |
| `get_bitcoin_smart_fees` | Fee Oracle | 1 sat / $0.001 | Real-time `estimatesmartfee` projections (sat/vB) for fastest (1–2 blocks) and economic (6 blocks) confirmation targets. |
| `get_mempool_entropy` | Network State | 2 sats / $0.002 | Unconfirmed tx count, virtual backlog (`vsizeBytes`), total fee pool in sats, and dynamic congestion rating. |
| `verify_block_header` | Chain Truth | 1 sat / $0.001 | Latest verified Bitcoin Mainnet tip height, block hash, Merkle root, nonce, difficulty, and timestamp from bare-metal Core v31.1. |
| `pay_lightning_invoice` | Settlement | Free helper | Autonomously pays any BOLT-11 invoice via your configured Lightning wallet and returns cryptographic preimage. |

---

## 🏛️ Architecture & Ecosystem Verification

* **Unified Web Showcase & 402 Audit:** `https://sovroute.com`
* **Bare-Metal Node Gateway:** `https://node.sovroute.com`
* **Cryptographic Attestation Verifier:** `POST https://sovroute.com/v1/guard/verify-attestation` (Free)
* **Machine-Readable OpenAPI 3.1 Spec (23 Paid Endpoints):** `https://sovroute.com/openapi.json`
* **x402 v2 Bazaar Manifest:** `https://sovroute.com/.well-known/x402.json`
* **Agent Context & Guidance:** `https://sovroute.com/llms.txt`
* **Circle for Agents Score:** `100/100 Grade A (Runtime-verified)`
* **Satring Directory:** `#1097 [domain verified]`
* **Glama MCP Catalog:** `sovereign-node-mcp [verified & indexed]`

---

## 📄 License
MIT License. Created by [SovRoute](https://sovroute.com).
