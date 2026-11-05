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
  bip125Replaceable: z.boolean(),
  vsize: z.number().int().nonnegative(),
  feeRateSatPerVb: z.number().nonnegative(),
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

export type MempoolEntropy = z.infer<typeof MempoolEntropySchema>;
export type SmartFeeProjection = z.infer<typeof SmartFeeProjectionSchema>;
export type RbfShieldAssessment = z.infer<typeof RbfShieldAssessmentSchema>;
export type BlockHeaderTruth = z.infer<typeof BlockHeaderTruthSchema>;
export type LightningTopologySignal = z.infer<typeof LightningTopologySignalSchema>;
export type VerifiableNodeAttestation = z.infer<typeof VerifiableNodeAttestationSchema>;
