import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface McpToolMetadata {
  title: string;
  description: string;
  annotations: ToolAnnotations;
  outputSchema: z.ZodObject<any>;
}

export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const PAYMENT_ACTION_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const genericEnvelope = {
  verdict: z.string().optional().describe('Deterministic decision or classification label when applicable'),
  timestamp: z.string().optional().describe('ISO-8601 evaluation timestamp when provided'),
};

export const MCP_TOOL_METADATA: Record<string, McpToolMetadata> = {
  get_bitcoin_smart_fees: {
    title: 'Bitcoin Smart Fee Estimates',
    description:
      'Read-only, side-effect-free query that fetches real-time Bitcoin mainnet fee rates (sat/vB) across confirmation targets directly from bare-metal Bitcoin Core v31.1 RPC. Use this before constructing or pricing a Bitcoin transaction; use get_mempool_entropy for overall mempool congestion/vsize or get_next_block_xray to see if a specific txid fits in the next block template.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        fastestFee: z.number().optional().describe('Estimated sat/vB for next-block confirmation'),
        halfHourFee: z.number().optional().describe('Estimated sat/vB for ~3-block confirmation'),
        hourFee: z.number().optional().describe('Estimated sat/vB for ~6-block confirmation'),
        economyFee: z.number().optional().describe('Estimated sat/vB for low-priority confirmation'),
        minimumFee: z.number().optional().describe('Minimum mempool relay fee in sat/vB'),
      })
      .passthrough(),
  },

  get_mempool_entropy: {
    title: 'Bitcoin Mempool Entropy',
    description:
      'Read-only, side-effect-free query that fetches live Bitcoin mainnet mempool statistics (unconfirmed transaction count, virtual size, total fee pool) from Bitcoin Core RPC. Use this to gauge network-wide congestion before broadcasting; use get_bitcoin_smart_fees for target sat/vB fee rates or get_next_block_xray for candidate block template inclusion.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        txCount: z.number().optional().describe('Current unconfirmed transaction count in mempool'),
        vsizeBytes: z.number().optional().describe('Total mempool virtual size in vbytes'),
        totalFeeSats: z.number().optional().describe('Total fees waiting in mempool in satoshis'),
      })
      .passthrough(),
  },

  check_rbf_fraud_shield: {
    title: 'Bitcoin RBF Fraud Shield',
    description:
      'Read-only, side-effect-free inspection of an unconfirmed Bitcoin transaction ID for BIP-125 Replace-By-Fee (RBF) double-spend replaceability, fee rate, and unconfirmed ancestor chains. Use this when evaluating an incoming 0-conf Bitcoin txid; use simulate_raw_transaction to validate an unsigned/signed raw tx hex before broadcast, or preflight_transaction_guard for a unified ALLOW/WARN/BLOCK verdict.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        txid: z.string().optional().describe('Inspected 64-character hex Bitcoin transaction ID'),
        rbfSignaled: z.boolean().optional().describe('Whether BIP-125 RBF signaling is active'),
        riskLevel: z.string().optional().describe('Double-spend risk classification'),
        ...genericEnvelope,
      })
      .passthrough(),
  },

  get_next_block_xray: {
    title: 'Next Block Template X-Ray',
    description:
      'Read-only, side-effect-free inspection of the live Bitcoin Core candidate block template (getblocktemplate) showing cutoff fee rates and optional txid queue rank. Use this to check whether a pending txid is likely to enter the very next block; use get_bitcoin_smart_fees for general fee estimation or check_rbf_fraud_shield for 0-conf double-spend risk.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        blockHeight: z.number().optional().describe('Candidate next block height'),
        txCount: z.number().optional().describe('Transactions included in candidate block template'),
        minFeeRateSatVb: z.number().optional().describe('Cutoff fee rate in sat/vB for next-block inclusion'),
        inTemplate: z.boolean().optional().describe('Whether the queried txid is in the candidate block'),
      })
      .passthrough(),
  },

  simulate_raw_transaction: {
    title: 'Bitcoin Raw Transaction Simulator',
    description:
      'Read-only, zero-broadcast Bitcoin Core v31.1 consensus and script dry-run (testmempoolaccept) that never broadcasts to the P2P network. Use this to verify a raw signed Bitcoin transaction hex before broadcasting; use check_rbf_fraud_shield to inspect an already-mempool txid or preflight_transaction_guard for a combined consensus + RBF verdict with signed attestation.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        allowed: z.boolean().optional().describe('Whether Bitcoin Core consensus rules accept the transaction'),
        txid: z.string().optional().describe('Decoded transaction ID'),
        rejectReason: z.string().nullable().optional().describe('Consensus rejection reason if allowed is false'),
      })
      .passthrough(),
  },

  verify_block_header: {
    title: 'Bitcoin Block Header Verifier',
    description:
      'Read-only, side-effect-free query returning the latest mined Bitcoin mainnet block header (height, hash, difficulty, timestamp) directly from Bitcoin Core RPC. Use this to anchor chain tip state or verify finality; use get_next_block_xray to inspect the unmined candidate block template.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        height: z.number().optional().describe('Latest mined Bitcoin block height'),
        hash: z.string().optional().describe('Latest mined block header hash'),
        difficulty: z.number().optional().describe('Current network mining difficulty'),
        time: z.number().optional().describe('Block header UNIX timestamp'),
      })
      .passthrough(),
  },

  inspect_eip7702_authorization: {
    title: 'EIP-7702 Authorization Scanner',
    description:
      'Read-only, side-effect-free security audit of an EIP-7702 (Pectra) authorization_list for wallet drainer bytecode, dangerous opcodes (SELFDESTRUCT, unverified DELEGATECALL), and chainId=0 cross-chain replay risk. Use this specifically when signing or reviewing EIP-7702 authorization tuples; use inspect_evm_address_safety for general EOA/proxy/token risk, simulate_evm_tx for full calldata execution, or preflight_transaction_guard for a unified ALLOW/WARN/BLOCK verdict.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        verdict: z.string().optional().describe('Risk verdict (SAFE_VERIFIED, SUSPICIOUS_UNVERIFIED, CRITICAL_DRAIN_RISK)'),
        riskScore: z.number().optional().describe('Numeric risk score (0-100)'),
        findings: z.array(z.unknown()).optional().describe('Per-authorization inspection findings'),
      })
      .passthrough(),
  },

  simulate_evm_tx: {
    title: 'EVM Transaction Simulator',
    description:
      'Read-only, side-effect-free EVM transaction dry-run (eth_call + gas estimation) that decodes revert reasons, detects unlimited ERC-20 approvals, flags EIP-7702 delegation targets, and scores ONNX drainer risk without signing or broadcasting. Use this when you have concrete from/to/data/value calldata to test; use inspect_evm_address_safety to check an address alone, inspect_eip7702_authorization for Pectra authorization_list tuples, or preflight_transaction_guard for a unified ALLOW/WARN/BLOCK guardrail.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        success: z.boolean().optional().describe('Whether eth_call simulation succeeded without reverting'),
        gasEstimate: z.string().optional().describe('Estimated gas usage'),
        revertReason: z.string().nullable().optional().describe('Decoded revert reason if simulation reverted'),
        drainerRiskScore: z.number().optional().describe('ONNX drainer probability score'),
        ...genericEnvelope,
      })
      .passthrough(),
  },

  inspect_evm_address_safety: {
    title: 'EVM Address Safety Inspector',
    description:
      'Read-only, side-effect-free EVM address and contract classification (EOA, EIP-7702 delegated EOA, EIP-1967 proxy, or ERC-20 token) checking privileged mint/pause/blacklist controls, SELFDESTRUCT opcodes, and ONNX drainer score. Use this before interacting with an unfamiliar address or contract; use simulate_evm_tx to dry-run specific transaction calldata, inspect_eip7702_authorization to audit EIP-7702 authorization_list tuples, or preflight_transaction_guard for a combined ALLOW/WARN/BLOCK verdict.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        address: z.string().optional().describe('Inspected 20-byte EVM address'),
        chainId: z.number().optional().describe('Inspected EVM chain ID'),
        classification: z.string().optional().describe('Detected account/contract type (EOA, EIP-7702, Proxy, ERC-20)'),
        riskLevel: z.string().optional().describe('Safety classification level'),
        drainerScore: z.number().optional().describe('ONNX drainer risk score'),
        ...genericEnvelope,
      })
      .passthrough(),
  },

  preflight_transaction_guard: {
    title: 'Unified Pre-Flight Transaction Guard',
    description:
      'Read-only, side-effect-free unified pre-sign guardrail returning ALLOW, WARN, or BLOCK with cryptographic HMAC-SHA256 node attestation (10x SLA Service Credit) across EVM (simulation + address safety + EIP-7702) or BTC (consensus simulation + RBF shield) plus optional stablecoin peg risk. Use this as the primary one-call pre-sign gate before executing any EVM or BTC transfer; use simulate_evm_tx, inspect_evm_address_safety, inspect_eip7702_authorization, simulate_raw_transaction, or check_rbf_fraud_shield when you only need a single specialized check.',
    annotations: READ_ONLY_ANNOTATIONS,
    outputSchema: z
      .object({
        decision: z.string().optional().describe('Final pre-flight verdict: ALLOW, WARN, or BLOCK'),
        protocol: z.string().optional().describe('Evaluated protocol (evm or btc)'),
        attestation: z.unknown().optional().describe('HMAC-SHA256 signed node attestation payload'),
        ...genericEnvelope,
      })
      .passthrough(),
  },

  pay_lightning_invoice: {
    title: 'Pay Lightning Invoice',
    description:
      'Stateful, value-transferring action that settles a BOLT11 Lightning Network invoice using the locally configured Phoenixd or Alby NWC wallet. Use ONLY when explicitly paying an L402 challenge or authorized invoice; never use for read-only inspection.',
    annotations: PAYMENT_ACTION_ANNOTATIONS,
    outputSchema: z
      .object({
        paymentHash: z.string().optional().describe('Settled Lightning payment hash'),
        preimage: z.string().optional().describe('Cryptographic payment preimage proof'),
        amountSats: z.number().optional().describe('Amount paid in satoshis'),
      })
      .passthrough(),
  },
};

export function toStructuredResult(payload: unknown): {
  content: [{ type: 'text'; text: string }];
  structuredContent?: Record<string, unknown>;
} {
  const result: {
    content: [{ type: 'text'; text: string }];
    structuredContent?: Record<string, unknown>;
  } = {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    result.structuredContent = payload as Record<string, unknown>;
  }
  return result;
}
