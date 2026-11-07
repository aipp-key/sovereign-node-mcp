import {
  NextBlockXray,
  NextBlockXraySchema,
  RbfShieldAssessment,
  RbfShieldAssessmentSchema,
  TxConsensusSimulation,
  TxConsensusSimulationSchema,
} from '../../domain/schemas/node-truth.schema.js';

export interface CandidateTxEntry {
  rank: number;
  txid: string;
  feeSats: number;
  vsize: number;
  weight: number;
  feeRateSatPerVb: number;
}

export interface CachedBlockTemplate {
  baseXray: Omit<NextBlockXray, 'inspectedTransaction'>;
  txMap: Map<string, CandidateTxEntry>;
  sampleTxid: string | null;
  sampleRawTxHex: string | null;
  expiresAt: number;
}

export function buildRbfFromMempoolEntry(txid: string, parsed: any): RbfShieldAssessment {
  const bip125 = parsed['bip125-replaceable'] === true;
  const vsize = parsed.vsize || 1;
  const ancestorCount = parsed.ancestorcount || 1;
  const ancestorSize = parsed.ancestorsize || vsize;
  const totalFeeSats = Math.round((parsed.fees?.base || 0) * 100_000_000);
  const ancestorFeeSats = Math.round((parsed.fees?.ancestor ?? parsed.fees?.base ?? 0) * 100_000_000);

  const baseFeeRate = totalFeeSats / vsize;
  const ancestorFeeRate = ancestorFeeSats / ancestorSize;
  const feeRateSatPerVb = Number(Math.min(baseFeeRate, ancestorFeeRate).toFixed(2));
  const hasConflicts = Array.isArray(parsed.spentby) && parsed.spentby.length > 0;

  let zeroConfRiskLevel: 'SAFE' | 'MEDIUM_RISK' | 'HIGH_RISK_RBF_ENABLED' | 'NOT_FOUND' = 'SAFE';
  let recommendation = 'Safe for instant 0-conf settlement. No RBF signaled.';

  if (hasConflicts) {
    zeroConfRiskLevel = 'HIGH_RISK_RBF_ENABLED';
    recommendation = 'CRITICAL ALERT: Conflicting spend detected in mempool! Do NOT deliver goods!';
  } else if (bip125) {
    zeroConfRiskLevel = 'HIGH_RISK_RBF_ENABLED';
    recommendation =
      ancestorCount > 1
        ? `WARNING: BIP-125 RBF enabled (ancestor chain depth: ${ancestorCount}). Transaction or parent can be replaced. Wait for 1 block confirmation.`
        : 'WARNING: BIP-125 RBF is enabled by sender. Transaction can be replaced. Wait for 1 block confirmation.';
  } else if (ancestorCount > 2 || feeRateSatPerVb < 1.5) {
    zeroConfRiskLevel = 'MEDIUM_RISK';
    recommendation =
      ancestorCount > 2
        ? `CAUTION: Unconfirmed parent chain (depth: ${ancestorCount}) increases replacement/eviction risk.`
        : 'CAUTION: Fee rate is low; confirmation may be delayed.';
  }

  return RbfShieldAssessmentSchema.parse({
    txid,
    isInMempool: true,
    confirmations: 0,
    bip125Replaceable: bip125,
    vsize,
    feeRateSatPerVb,
    ancestorCount,
    hasConflicts,
    zeroConfRiskLevel,
    recommendation,
    updatedAt: Math.floor(Date.now() / 1000),
  });
}

export function buildCachedBlockTemplate(
  rawTemplate: any,
  cacheTtlMs: number
): CachedBlockTemplate {
  const now = Date.now();
  const txs: any[] = Array.isArray(rawTemplate.transactions) ? rawTemplate.transactions : [];
  const totalTransactions = txs.length;
  const weightLimit = rawTemplate.weightlimit || 4_000_000;

  let totalWeight = 0;
  let totalFeeSats = 0;
  const entries: CandidateTxEntry[] = [];
  const txMap = new Map<string, CandidateTxEntry>();

  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    const weight = Number(t.weight || 400);
    const vsize = Math.max(1, Math.ceil(weight / 4));
    const feeSats = Number(t.fee || 0);
    const feeRateSatPerVb = Number((feeSats / vsize).toFixed(2));
    totalWeight += weight;
    totalFeeSats += feeSats;

    const entry: CandidateTxEntry = {
      rank: i + 1,
      txid: t.txid,
      feeSats,
      vsize,
      weight,
      feeRateSatPerVb,
    };
    entries.push(entry);
    txMap.set(t.txid, entry);
  }

  const sortedByFeeRate = [...entries].sort((a, b) => b.feeRateSatPerVb - a.feeRateSatPerVb);
  const topFeeRateSatPerVb = sortedByFeeRate.length > 0 ? sortedByFeeRate[0].feeRateSatPerVb : 0;
  const cutoffFeeRateSatPerVb =
    sortedByFeeRate.length > 0
      ? sortedByFeeRate[sortedByFeeRate.length - 1].feeRateSatPerVb
      : 1.0;
  const medianFeeRateSatPerVb =
    sortedByFeeRate.length > 0
      ? sortedByFeeRate[Math.floor(sortedByFeeRate.length / 2)].feeRateSatPerVb
      : 1.0;

  const topWhaleTransactions = [...entries]
    .sort((a, b) => b.feeSats - a.feeSats)
    .slice(0, 5)
    .map(({ rank, txid, feeSats, vsize, feeRateSatPerVb }) => ({
      rank,
      txid,
      feeSats,
      vsize,
      feeRateSatPerVb,
    }));

  const blockFillPercentage = Number(
    Math.min(100, (totalWeight / weightLimit) * 100).toFixed(2)
  );

  const baseXray: Omit<NextBlockXray, 'inspectedTransaction'> = {
    candidateBlockHeight: Number(rawTemplate.height || 0),
    previousBlockHash: String(rawTemplate.previousblockhash || '0'.repeat(64)),
    totalTransactions,
    totalWeight,
    blockFillPercentage,
    totalFeeSats,
    coinbaseRewardSats: Number(rawTemplate.coinbasevalue || totalFeeSats),
    cutoffFeeRateSatPerVb,
    medianFeeRateSatPerVb,
    topFeeRateSatPerVb,
    topWhaleTransactions,
    updatedAt: Math.floor(now / 1000),
  };

  return {
    baseXray,
    txMap,
    sampleTxid: txs[0]?.txid || null,
    sampleRawTxHex: txs[0]?.data || null,
    expiresAt: now + cacheTtlMs,
  };
}

export function finalizeNextBlockXray(
  cached: CachedBlockTemplate,
  inspectedTxid?: string,
  mempoolFallbackFeeRate?: number | null
): NextBlockXray {
  if (!inspectedTxid) {
    return NextBlockXraySchema.parse(cached.baseXray);
  }

  const found = cached.txMap.get(inspectedTxid);
  if (found) {
    const total = Math.max(1, cached.baseXray.totalTransactions);
    const percentileInBlock = Number(
      (((total - found.rank + 1) / total) * 100).toFixed(2)
    );
    return NextBlockXraySchema.parse({
      ...cached.baseXray,
      inspectedTransaction: {
        txid: inspectedTxid,
        inCandidateBlock: true,
        rankInBlock: found.rank,
        percentileInBlock,
        feeSats: found.feeSats,
        feeRateSatPerVb: found.feeRateSatPerVb,
        verdict: 'GUARANTEED_NEXT_BLOCK',
      },
    });
  }

  if (typeof mempoolFallbackFeeRate === 'number') {
    return NextBlockXraySchema.parse({
      ...cached.baseXray,
      inspectedTransaction: {
        txid: inspectedTxid,
        inCandidateBlock: false,
        rankInBlock: null,
        percentileInBlock: null,
        feeSats: null,
        feeRateSatPerVb: mempoolFallbackFeeRate,
        verdict: 'QUEUED_FOR_LATER_BLOCK',
      },
    });
  }

  return NextBlockXraySchema.parse({
    ...cached.baseXray,
    inspectedTransaction: {
      txid: inspectedTxid,
      inCandidateBlock: false,
      rankInBlock: null,
      percentileInBlock: null,
      feeSats: null,
      feeRateSatPerVb: null,
      verdict: 'NOT_IN_MEMPOOL',
    },
  });
}

export function buildTxConsensusSimulation(
  acceptResult: any,
  decodedTx: any,
  nextBlockCutoffSatPerVb: number
): TxConsensusSimulation {
  const rejectReason: string | null = acceptResult['reject-reason'] || null;
  const alreadyInMempool = rejectReason === 'txn-already-in-mempool';
  const consensusAllowed = acceptResult.allowed === true || alreadyInMempool;

  const vins: any[] = Array.isArray(decodedTx.vin) ? decodedTx.vin : [];
  const vouts: any[] = Array.isArray(decodedTx.vout) ? decodedTx.vout : [];

  const totalOutputSats = vouts.reduce(
    (acc, out) => acc + Math.round(Number(out.value || 0) * 100_000_000),
    0
  );
  const signalsBip125Rbf = vins.some(
    (vin) => typeof vin.sequence === 'number' && vin.sequence < 0xfffffffe
  );

  return TxConsensusSimulationSchema.parse({
    txid: decodedTx.txid || acceptResult.txid,
    wtxid: decodedTx.hash || acceptResult.wtxid || decodedTx.txid,
    consensusAllowed,
    alreadyInMempool,
    rejectReason,
    vsize: Number(decodedTx.vsize || 1),
    weight: Number(decodedTx.weight || 4),
    version: Number(decodedTx.version || 2),
    locktime: Number(decodedTx.locktime || 0),
    inputCount: vins.length,
    outputCount: vouts.length,
    totalOutputSats,
    signalsBip125Rbf,
    nextBlockCutoffSatPerVb,
    broadcastedToNetwork: false,
    simulatedAt: Math.floor(Date.now() / 1000),
  });
}

/**
 * Deterministic BOLT-11 Mainnet invoice amount parser (in integer satoshis).
 * Returns null if the invoice is invalid or amountless.
 */
export function parseBolt11AmountSats(invoice: string): number | null {
  if (!invoice || typeof invoice !== 'string') return null;
  const trimmed = invoice.trim().toLowerCase();
  const match = trimmed.match(/^lnbc(\d+)([munp])1[02-9ac-hj-np-z]+$/);
  if (!match) return null;

  const amountNum = Number(match[1]);
  const multiplier = match[2];
  if (!Number.isFinite(amountNum) || amountNum <= 0) return null;

  let sats = 0;
  if (multiplier === 'm') sats = amountNum * 100_000;
  else if (multiplier === 'u') sats = amountNum * 100;
  else if (multiplier === 'n') sats = amountNum / 10;
  else if (multiplier === 'p') sats = amountNum / 10_000;

  if (!Number.isInteger(sats) || sats <= 0) return null;
  return sats;
}
