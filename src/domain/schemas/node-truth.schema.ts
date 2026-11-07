import { z } from 'zod';

/**
 * Verifiable Sovereign Node Truth Schemas
 * Directly extracted from Bitcoin Core v31.1 & LND v0.21.3
 */

export const Hex64Schema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex string');

export const MempoolEntropySchema = z.object({
  txCount: z.number().int().nonnegative(),
  vsizeBytes: z.number().int().nonnegative(),
  totalFeeSats: z.number().int().nonnegative(),
  minFeeRateSatPerVb: z.number().nonnegative(),
  medianFeeRateSatPerVb: z.number().nonnegative(),
  fastFeeRateSatPerVb: z.number().nonnegative(),
  congestionLevel: z.enum(['LOW', 'MODERATE', 'HIGH', 'EXTREME']),
  updatedAt: z.number().int().positive(),
});

export const SmartFeeProjectionSchema = z.object({
  fastestSatPerVb: z.number().positive(),
  halfHourSatPerVb: z.number().positive(),
  hourSatPerVb: z.number().positive(),
  economicSatPerVb: z.number().positive(),
  targetBlocksFastest: z.number().int().positive(),
  targetBlocksEconomic: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export const RbfShieldAssessmentSchema = z.object({
  txid: Hex64Schema,
  isInMempool: z.boolean(),
  confirmations: z.number().int().nonnegative().optional(),
  bip125Replaceable: z.boolean(),
  vsize: z.number().int().nonnegative(),
  feeRateSatPerVb: z.number().nonnegative(),
  ancestorCount: z.number().int().nonnegative().optional(),
  hasConflicts: z.boolean(),
  zeroConfRiskLevel: z.enum(['SAFE', 'MEDIUM_RISK', 'HIGH_RISK_RBF_ENABLED', 'NOT_FOUND']),
  recommendation: z.string(),
  updatedAt: z.number().int().positive(),
});

export const BlockHeaderTruthSchema = z.object({
  height: z.number().int().nonnegative(),
  hash: Hex64Schema,
  previousBlockHash: Hex64Schema,
  merkleRoot: Hex64Schema,
  timestamp: z.number().int().positive(),
  bits: z.string(),
  nonce: z.number().int().nonnegative(),
  difficulty: z.number().positive(),
  chain: z.enum(['main', 'test', 'regtest']),
});

export const LightningTopologySignalSchema = z.object({
  activeChannels: z.number().int().nonnegative(),
  totalCapacitySats: z.number().int().nonnegative(),
  gossipUpdatesPerMinute: z.number().int().nonnegative(),
  routingFeeMedianPpm: z.number().int().nonnegative(),
  updatedAt: z.number().int().positive(),
});

export const VerifiableNodeAttestationSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  sourceNode: z.string(),
  dataType: z.enum([
    'MEMPOOL_ENTROPY',
    'SMART_FEE_PROJECTION',
    'RBF_SHIELD_ASSESSMENT',
    'BLOCK_HEADER',
    'LIGHTNING_TOPOLOGY',
  ]),
  data: z.union([
    MempoolEntropySchema,
    SmartFeeProjectionSchema,
    RbfShieldAssessmentSchema,
    BlockHeaderTruthSchema,
    LightningTopologySignalSchema,
  ]),
  nodePubKey: z.string(),
  signatureHex: z.string(),
  timestamp: z.number().int().positive(),
});

export const NextBlockXraySchema = z.object({
  candidateBlockHeight: z.number().int().positive(),
  previousBlockHash: Hex64Schema,
  totalTransactions: z.number().int().nonnegative(),
  totalWeight: z.number().int().nonnegative(),
  blockFillPercentage: z.number().nonnegative(),
  totalFeeSats: z.number().int().nonnegative(),
  coinbaseRewardSats: z.number().int().nonnegative(),
  cutoffFeeRateSatPerVb: z.number().nonnegative(),
  medianFeeRateSatPerVb: z.number().nonnegative(),
  topFeeRateSatPerVb: z.number().nonnegative(),
  topWhaleTransactions: z.array(
    z.object({
      rank: z.number().int().positive(),
      txid: Hex64Schema,
      feeSats: z.number().int().nonnegative(),
      vsize: z.number().int().positive(),
      feeRateSatPerVb: z.number().nonnegative(),
    })
  ),
  inspectedTransaction: z
    .object({
      txid: Hex64Schema,
      inCandidateBlock: z.boolean(),
      rankInBlock: z.number().int().positive().nullable(),
      percentileInBlock: z.number().nonnegative().nullable(),
      feeSats: z.number().int().nonnegative().nullable(),
      feeRateSatPerVb: z.number().nonnegative().nullable(),
      verdict: z.enum(['GUARANTEED_NEXT_BLOCK', 'QUEUED_FOR_LATER_BLOCK', 'NOT_IN_MEMPOOL']),
    })
    .optional(),
  updatedAt: z.number().int().positive(),
});

export const TxConsensusSimulationSchema = z.object({
  txid: Hex64Schema,
  wtxid: Hex64Schema,
  consensusAllowed: z.boolean(),
  alreadyInMempool: z.boolean(),
  rejectReason: z.string().nullable(),
  vsize: z.number().int().positive(),
  weight: z.number().int().positive(),
  version: z.number().int(),
  locktime: z.number().int().nonnegative(),
  inputCount: z.number().int().nonnegative(),
  outputCount: z.number().int().nonnegative(),
  totalOutputSats: z.number().int().nonnegative(),
  signalsBip125Rbf: z.boolean(),
  nextBlockCutoffSatPerVb: z.number().nonnegative(),
  broadcastedToNetwork: z.literal(false),
  simulatedAt: z.number().int().positive(),
});

export type MempoolEntropy = z.infer<typeof MempoolEntropySchema>;
export type SmartFeeProjection = z.infer<typeof SmartFeeProjectionSchema>;
export type RbfShieldAssessment = z.infer<typeof RbfShieldAssessmentSchema>;
export type BlockHeaderTruth = z.infer<typeof BlockHeaderTruthSchema>;
export type LightningTopologySignal = z.infer<typeof LightningTopologySignalSchema>;
export type NextBlockXray = z.infer<typeof NextBlockXraySchema>;
export type TxConsensusSimulation = z.infer<typeof TxConsensusSimulationSchema>;
export type VerifiableNodeAttestation = z.infer<typeof VerifiableNodeAttestationSchema>;
