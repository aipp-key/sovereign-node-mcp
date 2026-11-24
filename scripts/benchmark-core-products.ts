import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import {
  buildRbfFromMempoolEntry,
  buildTxConsensusSimulation,
} from '../src/infrastructure/bitcoin/bitcoin-forensics.helper.js';
import { EvmSafetyService } from '../src/application/services/evm-safety.service.js';
import { Eip7702ShieldService } from '../src/application/services/eip7702-shield.service.js';
import { PreflightGuardService } from '../src/application/services/preflight-guard.service.js';
import type { EvmRpcClient } from '../src/infrastructure/evm/evm-rpc.helper.js';

type BinaryEval = {
  id: string;
  expectedUnsafe: boolean;
  predictedUnsafe: boolean;
  latencyMs: number;
  detail: string;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[idx].toFixed(3));
}

function summarize(name: string, rows: BinaryEval[]) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const r of rows) {
    if (r.expectedUnsafe && r.predictedUnsafe) tp++;
    else if (!r.expectedUnsafe && r.predictedUnsafe) fp++;
    else if (!r.expectedUnsafe && !r.predictedUnsafe) tn++;
    else if (r.expectedUnsafe && !r.predictedUnsafe) fn++;
  }
  const total = rows.length;
  const accuracy = Number((((tp + tn) / total) * 100).toFixed(2));
  const precision = tp + fp === 0 ? 100 : Number(((tp / (tp + fp)) * 100).toFixed(2));
  const recall = tp + fn === 0 ? 100 : Number(((tp / (tp + fn)) * 100).toFixed(2));
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const meanMs = Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3));
  return {
    product: name,
    cases: total,
    tp,
    fp,
    tn,
    fn,
    accuracyPct: accuracy,
    precisionPct: precision,
    recallPct: recall,
    falsePositiveRatePct: fp + tn === 0 ? 0 : Number(((fp / (fp + tn)) * 100).toFixed(2)),
    falseNegativeRatePct: fn + tp === 0 ? 0 : Number(((fn / (fn + tp)) * 100).toFixed(2)),
    latencyMs: {
      mean: meanMs,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: Number(latencies[latencies.length - 1].toFixed(3)),
    },
  };
}

// ---------- 1. RBF SHIELD (12 CASES) ----------
function runRbfShieldBenchmark(): BinaryEval[] {
  const cases: Array<{ id: string; expectedUnsafe: boolean; entry: any }> = [
    // 6 Unsafe / Risky
    {
      id: 'rbf-01-conflicting-spend',
      expectedUnsafe: true,
      entry: { 'bip125-replaceable': false, vsize: 225, ancestorcount: 1, ancestorsize: 225, fees: { base: 0.000045, ancestor: 0.000045 }, spentby: ['a'.repeat(64)] },
    },
    {
      id: 'rbf-02-direct-bip125',
      expectedUnsafe: true,
      entry: { 'bip125-replaceable': true, vsize: 141, ancestorcount: 1, ancestorsize: 141, fees: { base: 0.0000282, ancestor: 0.0000282 }, spentby: [] },
    },
    {
      id: 'rbf-03-inherited-ancestor-rbf',
      expectedUnsafe: true,
      entry: { 'bip125-replaceable': true, vsize: 190, ancestorcount: 3, ancestorsize: 570, fees: { base: 0.000038, ancestor: 0.000095 }, spentby: [] },
    },
    {
      id: 'rbf-04-deep-unconfirmed-chain',
      expectedUnsafe: true,
      entry: { 'bip125-replaceable': false, vsize: 200, ancestorcount: 4, ancestorsize: 800, fees: { base: 0.00004, ancestor: 0.00016 }, spentby: [] },
    },
    {
      id: 'rbf-05-dust-fee-eviction-risk',
      expectedUnsafe: true,
      entry: { 'bip125-replaceable': false, vsize: 250, ancestorcount: 1, ancestorsize: 250, fees: { base: 0.0000025, ancestor: 0.0000025 }, spentby: [] },
    },
    {
      id: 'rbf-06-conflict-and-bip125',
      expectedUnsafe: true,
      entry: { 'bip125-replaceable': true, vsize: 180, ancestorcount: 2, ancestorsize: 360, fees: { base: 0.000018, ancestor: 0.000036 }, spentby: ['b'.repeat(64)] },
    },
    // 6 Safe
    {
      id: 'rbf-07-clean-p2wpkh-12satvb',
      expectedUnsafe: false,
      entry: { 'bip125-replaceable': false, vsize: 141, ancestorcount: 1, ancestorsize: 141, fees: { base: 0.00001692, ancestor: 0.00001692 }, spentby: [] },
    },
    {
      id: 'rbf-08-clean-p2tr-25satvb',
      expectedUnsafe: false,
      entry: { 'bip125-replaceable': false, vsize: 111, ancestorcount: 1, ancestorsize: 111, fees: { base: 0.00002775, ancestor: 0.00002775 }, spentby: [] },
    },
    {
      id: 'rbf-09-clean-batch-18satvb',
      expectedUnsafe: false,
      entry: { 'bip125-replaceable': false, vsize: 420, ancestorcount: 1, ancestorsize: 420, fees: { base: 0.0000756, ancestor: 0.0000756 }, spentby: [] },
    },
    {
      id: 'rbf-10-clean-2ancestor-nonrbf',
      expectedUnsafe: false,
      entry: { 'bip125-replaceable': false, vsize: 150, ancestorcount: 2, ancestorsize: 300, fees: { base: 0.000015, ancestor: 0.00003 }, spentby: [] },
    },
    {
      id: 'rbf-11-clean-ln-close-30satvb',
      expectedUnsafe: false,
      entry: { 'bip125-replaceable': false, vsize: 165, ancestorcount: 1, ancestorsize: 165, fees: { base: 0.0000495, ancestor: 0.0000495 }, spentby: [] },
    },
    {
      id: 'rbf-12-clean-high-fee-80satvb',
      expectedUnsafe: false,
      entry: { 'bip125-replaceable': false, vsize: 140, ancestorcount: 1, ancestorsize: 140, fees: { base: 0.000112, ancestor: 0.000112 }, spentby: [] },
    },
  ];

  return cases.map((c, i) => {
    const txid = `${i.toString(16).padStart(2, '0')}`.repeat(32);
    const t0 = performance.now();
    const res = buildRbfFromMempoolEntry(txid, c.entry);
    const latencyMs = performance.now() - t0;
    const predictedUnsafe = res.zeroConfRiskLevel !== 'SAFE';
    return {
      id: c.id,
      expectedUnsafe: c.expectedUnsafe,
      predictedUnsafe,
      latencyMs,
      detail: res.zeroConfRiskLevel,
    };
  });
}

// ---------- 2. TRANSACTION SIMULATOR (12 CASES: 6 BTC + 6 EVM) ----------
async function runSimulatorBenchmark(): Promise<BinaryEval[]> {
  const results: BinaryEval[] = [];

  // 6 BTC consensus cases
  const btcCases = [
    {
      id: 'sim-btc-01-missing-utxo',
      expectedUnsafe: true,
      accept: { txid: '1'.repeat(64), allowed: false, 'reject-reason': 'bad-txns-inputs-missingorspent' },
      decoded: { txid: '1'.repeat(64), hash: '1'.repeat(64), vsize: 141, weight: 564, version: 2, locktime: 0, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.01 }] },
    },
    {
      id: 'sim-btc-02-non-final-locktime',
      expectedUnsafe: true,
      accept: { txid: '2'.repeat(64), allowed: false, 'reject-reason': 'non-final' },
      decoded: { txid: '2'.repeat(64), hash: '2'.repeat(64), vsize: 141, weight: 564, version: 2, locktime: 999999, vin: [{ sequence: 0xfffffffe }], vout: [{ value: 0.01 }] },
    },
    {
      id: 'sim-btc-03-min-relay-fee',
      expectedUnsafe: true,
      accept: { txid: '3'.repeat(64), allowed: false, 'reject-reason': 'min relay fee not met' },
      decoded: { txid: '3'.repeat(64), hash: '3'.repeat(64), vsize: 220, weight: 880, version: 2, locktime: 0, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.005 }] },
    },
    {
      id: 'sim-btc-04-valid-p2wpkh',
      expectedUnsafe: false,
      accept: { txid: '4'.repeat(64), wtxid: '4'.repeat(64), allowed: true },
      decoded: { txid: '4'.repeat(64), hash: '4'.repeat(64), vsize: 141, weight: 564, version: 2, locktime: 0, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.025 }] },
    },
    {
      id: 'sim-btc-05-valid-p2tr',
      expectedUnsafe: false,
      accept: { txid: '5'.repeat(64), wtxid: '5'.repeat(64), allowed: true },
      decoded: { txid: '5'.repeat(64), hash: '5'.repeat(64), vsize: 111, weight: 444, version: 2, locktime: 0, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.1 }] },
    },
    {
      id: 'sim-btc-06-already-in-mempool',
      expectedUnsafe: false,
      accept: { txid: '6'.repeat(64), allowed: false, 'reject-reason': 'txn-already-in-mempool' },
      decoded: { txid: '6'.repeat(64), hash: '6'.repeat(64), vsize: 141, weight: 564, version: 2, locktime: 0, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.05 }] },
    },
  ];

  for (const c of btcCases) {
    const t0 = performance.now();
    const res = buildTxConsensusSimulation(c.accept, c.decoded, 8.5);
    const latencyMs = performance.now() - t0;
    results.push({
      id: c.id,
      expectedUnsafe: c.expectedUnsafe,
      predictedUnsafe: !res.consensusAllowed,
      latencyMs,
      detail: res.rejectReason ?? 'allowed',
    });
  }

  // 6 EVM simulation cases
  const FROM = '0x1111111111111111111111111111111111111111';
  const TO_CLEAN = '0x2222222222222222222222222222222222222222';
  const TO_ROUTER = '0x3333333333333333333333333333333333333333';
  const TO_REVERT = '0x4444444444444444444444444444444444444444';
  const TO_PANIC = '0x5555555555555555555555555555555555555555';
  const TO_SELFDESTRUCT = '0x6666666666666666666666666666666666666666';

  // Error("Insufficient") selector 0x08c379a0
  const REVERT_ERR =
    '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000c496e73756666696369656e740000000000000000000000000000000000000000';
  // Panic(0x11) selector 0x4e487b71
  const PANIC_ERR = '0x4e487b710000000000000000000000000000000000000000000000000000000000000011';
  // Unlimited ERC20 approve(spender, MAX_UINT256)
  const UNLIMITED_APPROVE =
    '0x095ea7b30000000000000000000000009999999999999999999999999999999999999999' + 'f'.repeat(64);
  // Clean ERC20 transfer(recipient, 100_000_000)
  const CLEAN_ERC20_TRANSFER =
    '0xa9059cbb00000000000000000000000099999999999999999999999999999999999999990000000000000000000000000000000000000000000000000000000005f5e100';
  // setApprovalForAll(operator, true)
  const SET_APPROVAL_ALL =
    '0xa22cb46500000000000000000000000099999999999999999999999999999999999999990000000000000000000000000000000000000000000000000000000000000001';

  const mockRpc: EvmRpcClient = {
    async call(_chainId, method, params) {
      const target = (params?.[0]?.to ?? params?.[0] ?? '').toLowerCase();
      if (method === 'eth_getCode') {
        if (target === TO_SELFDESTRUCT) return { result: '0x6001600052ff' }; // contains SELFDESTRUCT (0xff)
        if (target === TO_ROUTER || target === TO_REVERT || target === TO_PANIC) return { result: '0x608060405200' };
        return { result: '0x' };
      }
      if (method === 'eth_call') {
        if (target === TO_REVERT) return { error: { code: 3, message: 'execution reverted', data: REVERT_ERR } };
        if (target === TO_PANIC) return { error: { code: 3, message: 'execution reverted', data: PANIC_ERR } };
        return { result: '0x0000000000000000000000000000000000000000000000000000000000000001' };
      }
      if (method === 'eth_estimateGas') {
        if (target === TO_REVERT || target === TO_PANIC) return { error: { code: 3, message: 'gas estimation failed' } };
        return { result: '0x5208' };
      }
      return { result: '0x' };
    },
  };

  const evmSafety = new EvmSafetyService({
    rpc: mockRpc,
    scoreBytecodeFn: async () => ({ mlRiskScore: 5, mlVerdict: 'SAFE_ML' }),
  });

  const evmCases = [
    { id: 'sim-evm-01-revert-error', expectedUnsafe: true, req: { chainId: 8453, from: FROM, to: TO_REVERT, data: '0xa9059cbb', value: '0x0', blockTag: 'latest' as const } },
    { id: 'sim-evm-02-panic-overflow', expectedUnsafe: true, req: { chainId: 8453, from: FROM, to: TO_PANIC, data: '0xa9059cbb', value: '0x0', blockTag: 'latest' as const } },
    { id: 'sim-evm-03-selfdestruct-unlimited-approve', expectedUnsafe: true, req: { chainId: 8453, from: FROM, to: TO_SELFDESTRUCT, data: UNLIMITED_APPROVE, value: '0x0', blockTag: 'latest' as const } },
    { id: 'sim-evm-04-set-approval-for-all', expectedUnsafe: true, req: { chainId: 8453, from: FROM, to: TO_ROUTER, data: SET_APPROVAL_ALL, value: '0x0', blockTag: 'latest' as const } },
    { id: 'sim-evm-05-clean-native-transfer', expectedUnsafe: false, req: { chainId: 8453, from: FROM, to: TO_CLEAN, data: '0x', value: '0x100', blockTag: 'latest' as const } },
    { id: 'sim-evm-06-clean-erc20-transfer', expectedUnsafe: false, req: { chainId: 8453, from: FROM, to: TO_ROUTER, data: CLEAN_ERC20_TRANSFER, value: '0x0', blockTag: 'latest' as const } },
  ];

  for (const c of evmCases) {
    const t0 = performance.now();
    const res = await evmSafety.simulateTransaction(c.req);
    const latencyMs = performance.now() - t0;
    results.push({
      id: c.id,
      expectedUnsafe: c.expectedUnsafe,
      predictedUnsafe: res.verdict !== 'ALLOW',
      latencyMs,
      detail: `${res.verdict} (score=${res.riskScore})`,
    });
  }

  return results;
}

// ---------- 3. UNIFIED PREFLIGHT GUARD (12 CASES + ATTESTATION VERIFY) ----------
async function runPreflightBenchmark(): Promise<{ rows: BinaryEval[]; attestationVerifyMeanMs: number; tamperRejected: number }> {
  const FROM = '0x1111111111111111111111111111111111111111';
  const TO_CLEAN = '0x2222222222222222222222222222222222222222';
  const TO_SELFDESTRUCT = '0x6666666666666666666666666666666666666666';
  const TO_REVERT = '0x4444444444444444444444444444444444444444';

  const mockRpc: EvmRpcClient = {
    async call(_chainId, method, params) {
      const target = (params?.[0]?.to ?? params?.[0] ?? '').toLowerCase();
      if (method === 'eth_getCode') {
        if (target === TO_SELFDESTRUCT) return { result: '0x6001600052ff' };
        if (target === TO_REVERT) return { result: '0x608060405200' };
        return { result: '0x' };
      }
      if (method === 'eth_call') {
        if (target === TO_REVERT) return { error: { code: 3, message: 'execution reverted', data: '0x' } };
        return { result: '0x' };
      }
      if (method === 'eth_estimateGas') {
        if (target === TO_REVERT) return { error: { code: 3, message: 'revert' } };
        return { result: '0x5208' };
      }
      if (method === 'eth_getBalance') return { result: '0x100' };
      if (method === 'eth_getTransactionCount') return { result: '0x5' };
      return { result: '0x' };
    },
  };

  const evmSafety = new EvmSafetyService({
    rpc: mockRpc,
    scoreBytecodeFn: async () => ({ mlRiskScore: 5, mlVerdict: 'SAFE_ML' }),
  });
  const eip7702 = new Eip7702ShieldService();
  const mockOracles = {
    getStablecoinPeg: () => ({
      assets: [
        { symbol: 'USDC', depegRiskScore: 5, deviationBps: 1 },
        { symbol: 'USDT', depegRiskScore: 82, deviationBps: -210 },
      ],
    }),
  } as any;

  const mockNodeTruth = {
    async checkRbfShield(txid: string) {
      if (txid.startsWith('aa')) {
        return buildRbfFromMempoolEntry(txid, { 'bip125-replaceable': true, vsize: 180, ancestorcount: 3, ancestorsize: 540, fees: { base: 0.000018, ancestor: 0.000054 }, spentby: [] });
      }
      if (txid.startsWith('bb')) {
        return buildRbfFromMempoolEntry(txid, { 'bip125-replaceable': false, vsize: 180, ancestorcount: 1, ancestorsize: 180, fees: { base: 0.000018, ancestor: 0.000018 }, spentby: ['c'.repeat(64)] });
      }
      return buildRbfFromMempoolEntry(txid, { 'bip125-replaceable': false, vsize: 141, ancestorcount: 1, ancestorsize: 141, fees: { base: 0.0000282, ancestor: 0.0000282 }, spentby: [] });
    },
    async simulateTxConsensus(rawHex: string) {
      if (rawHex.startsWith('dead')) {
        return buildTxConsensusSimulation({ txid: 'd'.repeat(64), allowed: false, 'reject-reason': 'bad-txns-inputs-missingorspent' }, { txid: 'd'.repeat(64), hash: 'd'.repeat(64), vsize: 141, weight: 564, version: 2, locktime: 0, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.01 }] }, 8);
      }
      return buildTxConsensusSimulation({ txid: 'e'.repeat(64), allowed: true }, { txid: 'e'.repeat(64), hash: 'e'.repeat(64), vsize: 141, weight: 564, version: 2, locktime: 0, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.01 }] }, 8);
    },
  } as any;

  const guard = new PreflightGuardService({
    evmSafetyService: evmSafety,
    eip7702ShieldService: eip7702,
    nodeTruthService: mockNodeTruth,
    oracleFeedsService: mockOracles,
  });

  const cases: Array<{ id: string; expectedUnsafe: boolean; req: any }> = [
    // 6 Unsafe
    {
      id: 'pf-01-eip7702-wildcard-drainer',
      expectedUnsafe: true,
      req: { protocol: 'evm', chainId: 8453, from: FROM, to: TO_CLEAN, data: '0x', value: '0x0', blockTag: 'latest', authorizationList: [{ chainId: 0, address: '0x9999999999999999999999999999999999999999', nonce: 0 }] },
    },
    {
      id: 'pf-02-selfdestruct-target',
      expectedUnsafe: true,
      req: { protocol: 'evm', chainId: 8453, from: FROM, to: TO_SELFDESTRUCT, data: '0x', value: '0x0', blockTag: 'latest' },
    },
    {
      id: 'pf-03-severe-stablecoin-depeg',
      expectedUnsafe: true,
      req: { protocol: 'evm', chainId: 8453, from: FROM, to: TO_CLEAN, data: '0x', value: '0x0', blockTag: 'latest', stablecoinSymbol: 'USDT' },
    },
    {
      id: 'pf-04-revert-calldata',
      expectedUnsafe: true,
      req: { protocol: 'evm', chainId: 8453, from: FROM, to: TO_REVERT, data: '0xa9059cbb', value: '0x0', blockTag: 'latest' },
    },
    {
      id: 'pf-05-btc-bip125-rbf',
      expectedUnsafe: true,
      req: { protocol: 'btc', txid: 'aa'.repeat(32) },
    },
    {
      id: 'pf-06-btc-conflicting-spend-and-bad-raw',
      expectedUnsafe: true,
      req: { protocol: 'btc', txid: 'bb'.repeat(32), rawTxHex: 'deadbeef'.repeat(16) },
    },
    // 6 Safe
    {
      id: 'pf-07-clean-base-usdc',
      expectedUnsafe: false,
      req: { protocol: 'evm', chainId: 8453, from: FROM, to: TO_CLEAN, data: '0x', value: '0x0', blockTag: 'latest', stablecoinSymbol: 'USDC' },
    },
    {
      id: 'pf-08-clean-eth-mainnet',
      expectedUnsafe: false,
      req: { protocol: 'evm', chainId: 1, from: FROM, to: TO_CLEAN, data: '0x', value: '0x100', blockTag: 'latest' },
    },
    {
      id: 'pf-09-clean-arbitrum',
      expectedUnsafe: false,
      req: { protocol: 'evm', chainId: 42161, from: FROM, to: TO_CLEAN, data: '0x', value: '0x0', blockTag: 'latest', stablecoinSymbol: 'USDC' },
    },
    {
      id: 'pf-10-clean-btc-0conf',
      expectedUnsafe: false,
      req: { protocol: 'btc', txid: 'cc'.repeat(32) },
    },
    {
      id: 'pf-11-clean-btc-raw-consensus',
      expectedUnsafe: false,
      req: { protocol: 'btc', rawTxHex: '0200000001abcdef'.padEnd(120, '0') },
    },
    {
      id: 'pf-12-eip7702-revocation-zero-addr',
      expectedUnsafe: false,
      req: { protocol: 'evm', chainId: 8453, from: FROM, to: TO_CLEAN, data: '0x', value: '0x0', blockTag: 'latest', authorizationList: [{ chainId: 8453, address: '0x0000000000000000000000000000000000000000', nonce: 1 }] },
    },
  ];

  const rows: BinaryEval[] = [];
  const verifyLatencies: number[] = [];
  let tamperRejected = 0;

  for (const c of cases) {
    const t0 = performance.now();
    const res = await guard.evaluate(c.req);
    const latencyMs = performance.now() - t0;

    const v0 = performance.now();
    const vRes = guard.verifyAttestation({ inspectedAt: res.inspectedAt, attestation: res.attestation! });
    verifyLatencies.push(performance.now() - v0);

    if (!vRes.valid) throw new Error(`Attestation failed to verify for ${c.id}`);
    const tampered = guard.verifyAttestation({
      inspectedAt: res.inspectedAt,
      attestation: { ...res.attestation!, riskScore: res.attestation!.riskScore === 99 ? 1 : 99 },
    });
    if (!tampered.valid) tamperRejected++;

    rows.push({
      id: c.id,
      expectedUnsafe: c.expectedUnsafe,
      predictedUnsafe: res.verdict !== 'ALLOW',
      latencyMs,
      detail: `${res.verdict} (score=${res.riskScore})`,
    });
  }

  const attestationVerifyMeanMs = Number(
    (verifyLatencies.reduce((a, b) => a + b, 0) / verifyLatencies.length).toFixed(3)
  );
  return { rows, attestationVerifyMeanMs, tamperRejected };
}

// ---------- 4. LIVE EDGE-TO-NODE HTTP LATENCY (10 ITERATIONS) ----------
async function measureLiveHttpLatency(url: string, body: unknown, iterations = 10) {
  const times: number[] = [];
  let statusOk = 0;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await res.text();
    times.push(performance.now() - t0);
    if (res.ok) statusOk++;
  }
  times.sort((a, b) => a - b);
  return {
    url,
    iterations,
    statusOk,
    meanMs: Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)),
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    minMs: Number(times[0].toFixed(1)),
    maxMs: Number(times[times.length - 1].toFixed(1)),
  };
}

async function main() {
  const rbfRows = runRbfShieldBenchmark();
  const simRows = await runSimulatorBenchmark();
  const pf = await runPreflightBenchmark();

  const liveSandbox = await measureLiveHttpLatency('https://sovroute.com/v1/guard/preflight/sandbox', {
    scenario: 'eip7702-drainer',
  });

  // Also grab a real attestation from sandbox and measure verify-attestation roundtrip
  const sampleRes = await fetch('https://sovroute.com/v1/guard/preflight/sandbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'clean-base-usdc' }),
  }).then((r) => r.json() as Promise<any>);

  const liveVerify = await measureLiveHttpLatency('https://sovroute.com/v1/guard/verify-attestation', {
    inspectedAt: sampleRes.data.inspectedAt,
    attestation: sampleRes.data.attestation,
  });

  const mismatches = [...rbfRows, ...simRows, ...pf.rows].filter(
    (r) => r.expectedUnsafe !== r.predictedUnsafe
  );

  const report = {
    generatedAt: new Date().toISOString(),
    totalCases: rbfRows.length + simRows.length + pf.rows.length,
    mismatches,
    products: [
      summarize('RBF Shield', rbfRows),
      summarize('Transaction Simulator (BTC + EVM)', simRows),
      summarize('Unified Preflight Guard', pf.rows),
    ],
    attestation: {
      casesVerified: pf.rows.length,
      tamperRejected: pf.tamperRejected,
      verifyMeanMs: pf.attestationVerifyMeanMs,
    },
    liveEdgeToBareMetalHttp: {
      sandboxPreflight: liveSandbox,
      verifyAttestation: liveVerify,
    },
  };

  writeFileSync('benchmark-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
