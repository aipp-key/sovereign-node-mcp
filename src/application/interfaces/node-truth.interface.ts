import {
  MempoolEntropy,
  BlockHeaderTruth,
  LightningTopologySignal,
  LightningNetworkStats,
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
  getLightningNetworkStats?(): Promise<LightningNetworkStats>;
  getNextBlockXray?(txid?: string): Promise<NextBlockXray>;
  simulateTxConsensus?(rawTxHex: string): Promise<TxConsensusSimulation>;
}
