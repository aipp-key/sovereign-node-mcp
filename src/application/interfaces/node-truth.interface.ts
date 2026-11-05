import {
  MempoolEntropy,
  BlockHeaderTruth,
  LightningTopologySignal,
  SmartFeeProjection,
  RbfShieldAssessment,
} from '../../domain/schemas/node-truth.schema.js';

export interface INodeTruthRepository {
  getMempoolEntropy(): Promise<MempoolEntropy>;
  getSmartFeeEstimates(): Promise<SmartFeeProjection>;
  checkRbfShield(txid: string): Promise<RbfShieldAssessment>;
  getLatestBlockHeader(): Promise<BlockHeaderTruth>;
  getLightningTopology(): Promise<LightningTopologySignal>;
}
