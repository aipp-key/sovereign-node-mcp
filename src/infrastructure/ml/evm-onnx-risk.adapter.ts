import path from 'node:path';
import * as ort from 'onnxruntime-node';

const DRAIN_SELECTORS = ['a9059cbb', '23b872dd', '095ea7b3', 'a22cb465', 'd505accf'];
const SAFE_SELECTORS = ['b61d27f6', '47e1da2a', 'ac9650d8', '3ccfd60b'];

const CHAIN_RPCS: Record<number, string> = {
  1: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  10: process.env.OPTIMISM_RPC_URL || 'https://optimism-rpc.publicnode.com',
  137: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  8453: process.env.BASE_RPC_URL || 'https://base-rpc.publicnode.com',
  42161: process.env.ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com',
};

export interface EvmMlRiskResult {
  mlRiskScore: number;
  mlVerdict: 'BENIGN_PATTERN' | 'SUSPICIOUS_ML' | 'DRAINER_ML_DETECTED';
  bytecodeSizeBytes: number;
  inferenceMs: number;
  modelVersion: string;
}

/**
 * Deterministic 32-dim EVM bytecode feature extractor (matches Python trainer 1:1).
 */
export function extractEvmFeatures(hexCode: string): { features: Float32Array; byteLen: number } {
  const clean = (hexCode.startsWith('0x') ? hexCode.slice(2) : hexCode).toLowerCase();
  const byteLen = Math.floor(clean.length / 2);
  if (byteLen === 0) {
    return { features: new Float32Array(32), byteLen: 0 };
  }

  const raw = new Uint8Array(byteLen);
  let zeroCount = 0;
  for (let i = 0; i < byteLen; i++) {
    const b = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    raw[i] = b;
    if (b === 0) zeroCount++;
  }

  let stopRetRev = 0, call = 0, delegatecall = 0, callcode = 0, selfdestruct = 0;
  let create = 0, sstore = 0, sload = 0, mem = 0, sha3 = 0, caller = 0, origin = 0;
  let callvalue = 0, balance = 0, extcode = 0, jump = 0, log = 0, push = 0;
  let totalOps = 0;
  const uniqueOps = new Set<number>();
  const selectors = new Set<string>();

  for (let pc = 0; pc < byteLen; pc++) {
    const op = raw[pc];
    totalOps++;
    uniqueOps.add(op);

    if (op === 0x00 || op === 0xf3 || op === 0xfd) stopRetRev++;
    else if (op === 0xf1 || op === 0xfa) call++;
    else if (op === 0xf4) delegatecall++;
    else if (op === 0xf2) callcode++;
    else if (op === 0xff) selfdestruct++;
    else if (op === 0xf0 || op === 0xf5) create++;
    else if (op === 0x55) sstore++;
    else if (op === 0x54) sload++;
    else if (op === 0x51 || op === 0x52 || op === 0x53) mem++;
    else if (op === 0x20) sha3++;
    else if (op === 0x33) caller++;
    else if (op === 0x32) origin++;
    else if (op === 0x34) callvalue++;
    else if (op === 0x31 || op === 0x47) balance++;
    else if (op === 0x3b || op === 0x3c || op === 0x3f) extcode++;
    else if (op === 0x56 || op === 0x57) jump++;
    else if (op >= 0xa0 && op <= 0xa4) log++;

    if (op === 0x63 && pc + 4 < byteLen) {
      selectors.add(clean.slice((pc + 1) * 2, (pc + 5) * 2));
    }
    if (op >= 0x60 && op <= 0x7f) {
      push++;
      pc += op - 0x5f;
    }
  }

  const denom = Math.max(1, totalOps);
  const drainHits = DRAIN_SELECTORS.map((s) => (selectors.has(s) ? 1 : 0));
  const safeHits = SAFE_SELECTORS.map((s) => (selectors.has(s) ? 1 : 0));
  const hasDrain = drainHits.some((v) => v > 0);

  const vec = new Float32Array([
    Math.log1p(byteLen) / 12,
    stopRetRev / denom,
    call / denom,
    Math.min(1, delegatecall / 5),
    Math.min(1, callcode / 3),
    selfdestruct > 0 ? 1 : 0,
    Math.min(1, create / 3),
    sstore / denom,
    sload / denom,
    mem / denom,
    sha3 / denom,
    caller / denom,
    origin > 0 ? 1 : 0,
    callvalue / denom,
    balance / denom,
    extcode / denom,
    jump / denom,
    log / denom,
    push / denom,
    uniqueOps.size / 256,
    ...drainHits,
    ...safeHits,
    delegatecall > 0 && hasDrain ? 1 : 0,
    origin > 0 && (call > 0 || hasDrain) ? 1 : 0,
    zeroCount / Math.max(1, byteLen),
  ]);

  return { features: vec, byteLen };
}

export class EvmOnnxRiskAdapter {
  private sessionPromise: Promise<ort.InferenceSession> | null = null;
  private readonly modelPath: string;

  constructor(modelPath?: string) {
    this.modelPath = modelPath || path.resolve(process.cwd(), 'assets', 'models', 'evm-bytecode-risk.onnx');
  }

  private getSession(): Promise<ort.InferenceSession> {
    if (!this.sessionPromise) {
      this.sessionPromise = ort.InferenceSession.create(this.modelPath);
    }
    return this.sessionPromise;
  }

  async scoreBytecode(hexCode: string): Promise<EvmMlRiskResult> {
    const { features, byteLen } = extractEvmFeatures(hexCode);
    if (byteLen === 0) {
      return {
        mlRiskScore: 0.5,
        mlVerdict: 'SUSPICIOUS_ML',
        bytecodeSizeBytes: 0,
        inferenceMs: 0,
        modelVersion: 'evm-bytecode-risk-v1.onnx',
      };
    }

    const t0 = performance.now();
    const session = await this.getSession();
    const tensor = new ort.Tensor('float32', features, [1, 32]);
    const outputs = await session.run({ features: tensor });
    const logit = Number((outputs.logits.data as Float32Array)[0]);
    const prob = 1 / (1 + Math.exp(-logit));
    const inferenceMs = Math.round((performance.now() - t0) * 100) / 100;
    const mlRiskScore = Math.round(prob * 10000) / 10000;

    const mlVerdict: EvmMlRiskResult['mlVerdict'] =
      mlRiskScore >= 0.75 ? 'DRAINER_ML_DETECTED' : mlRiskScore >= 0.4 ? 'SUSPICIOUS_ML' : 'BENIGN_PATTERN';

    return {
      mlRiskScore,
      mlVerdict,
      bytecodeSizeBytes: byteLen,
      inferenceMs,
      modelVersion: 'evm-bytecode-risk-v1.onnx',
    };
  }

  async fetchAndScoreAddress(chainId: number, address: string): Promise<EvmMlRiskResult> {
    const rpcUrl = CHAIN_RPCS[chainId];
    if (!rpcUrl) {
      throw new Error(`Unsupported chainId ${chainId} for RPC bytecode fetch`);
    }
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
      signal: AbortSignal.timeout(5000),
    });
    const json: any = await res.json();
    const code = typeof json?.result === 'string' ? json.result : '0x';
    return this.scoreBytecode(code);
  }
}
