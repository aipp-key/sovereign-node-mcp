import {
  MempoolEntropy,
  BlockHeaderTruth,
  LightningTopologySignal,
  SmartFeeProjection,
  RbfShieldAssessment,
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
}
