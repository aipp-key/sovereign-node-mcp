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
import { INodeTruthRepository } from '../interfaces/node-truth.interface.js';

export class NodeTruthService {
  constructor(private readonly repository: INodeTruthRepository) {}

  async getMempoolEntropy(): Promise<MempoolEntropy> {
    return this.repository.getMempoolEntropy();
  }

  async getSmartFeeEstimates(): Promise<SmartFeeProjection> {
    return this.repository.getSmartFeeEstimates();
  }

  async checkRbfShield(txid: string): Promise<RbfShieldAssessment> {
    return this.repository.checkRbfShield(txid);
  }

  async getLatestBlockHeader(): Promise<BlockHeaderTruth> {
    return this.repository.getLatestBlockHeader();
  }

  async getLightningTopology(): Promise<LightningTopologySignal> {
    return this.repository.getLightningTopology();
  }

  async getLightningNetworkStats(): Promise<LightningNetworkStats> {
    if (!this.repository.getLightningNetworkStats) {
      throw new Error('getLightningNetworkStats is not implemented by the active repository');
    }
    return this.repository.getLightningNetworkStats();
  }

  async getNextBlockXray(txid?: string): Promise<NextBlockXray> {
    if (!this.repository.getNextBlockXray) {
      throw new Error('getNextBlockXray is not implemented by the active repository');
    }
    return this.repository.getNextBlockXray(txid);
  }

  async simulateTxConsensus(rawTxHex: string): Promise<TxConsensusSimulation> {
    if (!this.repository.simulateTxConsensus) {
      throw new Error('simulateTxConsensus is not implemented by the active repository');
    }
    return this.repository.simulateTxConsensus(rawTxHex);
  }
}
