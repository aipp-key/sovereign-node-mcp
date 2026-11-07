import {
  MempoolEntropy,
  BlockHeaderTruth,
  LightningTopologySignal,
  SmartFeeProjection,
  RbfShieldAssessment,
  NextBlockXray,
  TxConsensusSimulation,
} from '../../domain/schemas/node-truth.schema.js';

export interface INodeTruthRepository {
  getMempoolEntropy(): Promise<MempoolEntropy>;
  getSmartFeeEstimates(): Promise<SmartFeeProjection>;
  checkRbfShield(txid: string): Promise<RbfShieldAssessment>;
  getLatestBlockHeader(): Promise<BlockHeaderTruth>;
  getLightningTopology(): Promise<LightningTopologySignal>;
  getNextBlockXray?(txid?: string): Promise<NextBlockXray>;
  simulateTxConsensus?(rawTxHex: string): Promise<TxConsensusSimulation>;
}
