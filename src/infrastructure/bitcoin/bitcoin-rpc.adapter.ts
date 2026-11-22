import { exec } from 'child_process';
import { promisify } from 'util';
import { INodeTruthRepository } from '../../application/interfaces/node-truth.interface.js';
import {
  MempoolEntropy,
  BlockHeaderTruth,
  LightningTopologySignal,
  LightningNetworkStats,
  SmartFeeProjection,
  RbfShieldAssessment,
  NextBlockXray,
  TxConsensusSimulation,
  MempoolEntropySchema,
  SmartFeeProjectionSchema,
  RbfShieldAssessmentSchema,
  BlockHeaderTruthSchema,
  LightningNetworkStatsSchema,
} from '../../domain/schemas/node-truth.schema.js';
import {
  CachedBlockTemplate,
  buildCachedBlockTemplate,
  buildRbfFromMempoolEntry,
  finalizeNextBlockXray,
  buildTxConsensusSimulation,
} from './bitcoin-forensics.helper.js';

const execAsync = promisify(exec);

export interface BitcoinRpcConfig {
  tailscaleHost: string;
  containerName: string;
  lndContainerName?: string;
  cacheTtlMs?: number;
}

export class BitcoinRpcAdapter implements INodeTruthRepository {
  private mempoolCache: { data: MempoolEntropy; expiresAt: number } | null = null;
  private smartFeeCache: { data: SmartFeeProjection; expiresAt: number } | null = null;
  private blockCache: { data: BlockHeaderTruth; expiresAt: number } | null = null;
  private lightningStatsCache: { data: LightningNetworkStats; expiresAt: number } | null = null;
  private templateCache: CachedBlockTemplate | null = null;
  private readonly cacheTtlMs: number;

  constructor(private readonly config: BitcoinRpcConfig) {
    this.cacheTtlMs = config.cacheTtlMs || 5000; // default 5 seconds cache
  }

  private async executeNodeCommand(cmd: string): Promise<string> {
    const isLocal = this.config.tailscaleHost === '127.0.0.1' || this.config.tailscaleHost === 'localhost';
    const fullCommand = isLocal
      ? `docker exec ${this.config.containerName} ${cmd}`
      : `ssh -o ConnectTimeout=5 -o BatchMode=yes root@${this.config.tailscaleHost} "docker exec ${this.config.containerName} ${cmd}"`;
    const { stdout, stderr } = await execAsync(fullCommand, { maxBuffer: 16 * 1024 * 1024 });
    if (stderr && !stdout) {
      throw new Error(`Bitcoin Node RPC Error: ${stderr}`);
    }
    return stdout.trim();
  }

  private async executeNodeStdinCommand(subcommand: string, stdinText: string): Promise<string> {
    const b64 = Buffer.from(stdinText, 'utf8').toString('base64');
    const isLocal = this.config.tailscaleHost === '127.0.0.1' || this.config.tailscaleHost === 'localhost';
    const fullCommand = isLocal
      ? `sh -c 'echo ${b64} | base64 -d | docker exec -i ${this.config.containerName} bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data -stdin ${subcommand}'`
      : `ssh -o ConnectTimeout=5 -o BatchMode=yes root@${this.config.tailscaleHost} "echo ${b64} | base64 -d | docker exec -i ${this.config.containerName} bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data -stdin ${subcommand}"`;
    const { stdout, stderr } = await execAsync(fullCommand, { maxBuffer: 32 * 1024 * 1024 });
    if (stderr && !stdout) {
      throw new Error(`Bitcoin Node RPC Stdin Error: ${stderr}`);
    }
    return stdout.trim();
  }

  async getMempoolEntropy(): Promise<MempoolEntropy> {
    const now = Date.now();
    if (this.mempoolCache && this.mempoolCache.expiresAt > now) {
      return this.mempoolCache.data;
    }

    const [rawOutput, smartFees] = await Promise.all([
      this.executeNodeCommand(
        'bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data getmempoolinfo'
      ),
      this.getSmartFeeEstimates(),
    ]);
    const parsed = JSON.parse(rawOutput);

    const txCount = parsed.size || 0;
    const vsizeBytes = parsed.bytes || 0;
    const totalFeeSats = Math.round((parsed.total_fee || 0) * 100_000_000);
    const minFeeRate = Number(((parsed.mempoolminfee || 0.000001) * 100_000).toFixed(2)); // sat/vB
    const medianFeeRate = Number(Math.max(smartFees.economicSatPerVb, minFeeRate).toFixed(2));
    const fastFeeRate = Number(Math.max(smartFees.fastestSatPerVb, medianFeeRate).toFixed(2));

    let congestionLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' = 'LOW';
    if (txCount > 100_000 || vsizeBytes > 50_000_000) congestionLevel = 'EXTREME';
    else if (txCount > 50_000 || vsizeBytes > 15_000_000) congestionLevel = 'HIGH';
    else if (txCount > 15_000 || vsizeBytes > 4_000_000) congestionLevel = 'MODERATE';

    const payload = {
      txCount,
      vsizeBytes,
      totalFeeSats,
      minFeeRateSatPerVb: minFeeRate,
      medianFeeRateSatPerVb: medianFeeRate,
      fastFeeRateSatPerVb: fastFeeRate,
      congestionLevel,
      updatedAt: Math.floor(now / 1000),
    };

    const validated = MempoolEntropySchema.parse(payload);
    this.mempoolCache = { data: validated, expiresAt: now + this.cacheTtlMs };
    return validated;
  }

  async getSmartFeeEstimates(): Promise<SmartFeeProjection> {
    const now = Date.now();
    if (this.smartFeeCache && this.smartFeeCache.expiresAt > now) {
      return this.smartFeeCache.data;
    }

    const [fastRaw, econRaw] = await Promise.all([
      this.executeNodeCommand('bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data estimatesmartfee 1'),
      this.executeNodeCommand('bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data estimatesmartfee 6'),
    ]);

    const parsedFast = JSON.parse(fastRaw);
    const parsedEcon = JSON.parse(econRaw);

    // feerate is BTC/kvB. Multiply by 100,000 to get sat/vB
    const fastSatPerVb = Number(((parsedFast.feerate || 0.000075) * 100_000).toFixed(2));
    const econSatPerVb = Number(((parsedEcon.feerate || 0.000040) * 100_000).toFixed(2));
    const halfHourSatPerVb = Number((econSatPerVb * 1.3).toFixed(2));
    const hourSatPerVb = Number((econSatPerVb * 1.1).toFixed(2));

    const payload = {
      fastestSatPerVb: Math.max(fastSatPerVb, 1.0),
      halfHourSatPerVb: Math.max(halfHourSatPerVb, 1.0),
      hourSatPerVb: Math.max(hourSatPerVb, 1.0),
      economicSatPerVb: Math.max(econSatPerVb, 1.0),
      targetBlocksFastest: parsedFast.blocks || 2,
      targetBlocksEconomic: parsedEcon.blocks || 6,
      updatedAt: Math.floor(now / 1000),
    };

    const validated = SmartFeeProjectionSchema.parse(payload);
    this.smartFeeCache = { data: validated, expiresAt: now + this.cacheTtlMs };
    return validated;
  }

  async checkRbfShield(txid: string): Promise<RbfShieldAssessment> {
    if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
      throw new Error('Invalid 64-character hex transaction ID');
    }

    try {
      const rawOutput = await this.executeNodeCommand(
        `bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data getmempoolentry ${txid}`
      );
      return buildRbfFromMempoolEntry(txid, JSON.parse(rawOutput));
    } catch {
      // Not in mempool: probe UTXO set (vout 0 and 1) to check if already confirmed in a block
      try {
        const [vout0, vout1] = await Promise.allSettled([
          this.executeNodeCommand(
            `bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data gettxout ${txid} 0 false`
          ),
          this.executeNodeCommand(
            `bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data gettxout ${txid} 1 false`
          ),
        ]);

        const rawUtxo =
          (vout0.status === 'fulfilled' && vout0.value ? vout0.value : '') ||
          (vout1.status === 'fulfilled' && vout1.value ? vout1.value : '');

        if (rawUtxo) {
          const utxo = JSON.parse(rawUtxo);
          if (typeof utxo?.confirmations === 'number' && utxo.confirmations >= 1) {
            return RbfShieldAssessmentSchema.parse({
              txid,
              isInMempool: false,
              confirmations: utxo.confirmations,
              bip125Replaceable: false,
              vsize: 0,
              feeRateSatPerVb: 0,
              ancestorCount: 0,
              hasConflicts: false,
              zeroConfRiskLevel: 'SAFE',
              recommendation: `CONFIRMED: Transaction is already mined in a block (${utxo.confirmations} confirmations). Zero double-spend risk.`,
              updatedAt: Math.floor(Date.now() / 1000),
            });
          }
        }
      } catch {
        // Ignore UTXO lookup errors and fall through to NOT_FOUND
      }

      return RbfShieldAssessmentSchema.parse({
        txid,
        isInMempool: false,
        confirmations: 0,
        bip125Replaceable: false,
        vsize: 0,
        feeRateSatPerVb: 0,
        ancestorCount: 0,
        hasConflicts: false,
        zeroConfRiskLevel: 'NOT_FOUND',
        recommendation: 'Transaction not found in node mempool or active UTXO set. May not be propagated.',
        updatedAt: Math.floor(Date.now() / 1000),
      });
    }
  }

  async getSampleMempoolTxid(): Promise<string> {
    const rawOutput = await this.executeNodeCommand(
      `sh -c 'bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data getrawmempool false | grep -oE "[0-9a-f]{64}" | head -n 1'`
    );
    const txid = rawOutput.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
      throw new Error('Mempool is currently empty or failed to extract sample txid');
    }
    return txid;
  }

  private async ensureBlockTemplateCache(): Promise<CachedBlockTemplate> {
    const now = Date.now();
    if (this.templateCache && this.templateCache.expiresAt > now) {
      return this.templateCache;
    }
    const rawOutput = await this.executeNodeStdinCommand(
      'getblocktemplate',
      '{"rules":["segwit"]}\n'
    );
    const parsed = JSON.parse(rawOutput);
    this.templateCache = buildCachedBlockTemplate(parsed, this.cacheTtlMs);
    return this.templateCache;
  }

  async getNextBlockXray(txid?: string): Promise<NextBlockXray> {
    const cached = await this.ensureBlockTemplateCache();
    if (!txid) {
      return finalizeNextBlockXray(cached);
    }

    if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
      throw new Error('Invalid 64-character hex transaction ID');
    }

    if (cached.txMap.has(txid)) {
      return finalizeNextBlockXray(cached, txid);
    }

    // Check if it's in the lower-fee mempool outside the next candidate block
    const rbfCheck = await this.checkRbfShield(txid);
    const fallbackFeeRate = rbfCheck.isInMempool ? rbfCheck.feeRateSatPerVb : null;
    return finalizeNextBlockXray(cached, txid, fallbackFeeRate);
  }

  async simulateTxConsensus(rawTxHex: string): Promise<TxConsensusSimulation> {
    if (!rawTxHex || !/^[0-9a-fA-F]{100,200000}$/.test(rawTxHex) || rawTxHex.length % 2 !== 0) {
      throw new Error('Invalid raw Bitcoin transaction hex string');
    }

    const [acceptRaw, decodedRaw, cachedTemplate] = await Promise.all([
      this.executeNodeStdinCommand('testmempoolaccept', `["${rawTxHex}"]\n`),
      this.executeNodeStdinCommand('decoderawtransaction', `${rawTxHex}\n`),
      this.ensureBlockTemplateCache(),
    ]);

    const acceptArr = JSON.parse(acceptRaw);
    const acceptResult = Array.isArray(acceptArr) ? acceptArr[0] : acceptArr;
    const decodedTx = JSON.parse(decodedRaw);

    return buildTxConsensusSimulation(
      acceptResult,
      decodedTx,
      cachedTemplate.baseXray.cutoffFeeRateSatPerVb
    );
  }

  async getSampleCandidateRawTxHex(): Promise<{ txid: string; rawTxHex: string }> {
    const cached = await this.ensureBlockTemplateCache();
    if (!cached.sampleRawTxHex || !cached.sampleTxid) {
      throw new Error('No sample transaction available in candidate block template');
    }
    return { txid: cached.sampleTxid, rawTxHex: cached.sampleRawTxHex };
  }

  async getLatestBlockHeader(): Promise<BlockHeaderTruth> {
    const now = Date.now();
    if (this.blockCache && this.blockCache.expiresAt > now) {
      return this.blockCache.data;
    }

    const rawOutput = await this.executeNodeCommand(
      'bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data getblockchaininfo'
    );
    const parsed = JSON.parse(rawOutput);

    const headerRaw = await this.executeNodeCommand(
      `bitcoin-cli -conf=/config/bitcoin.conf -datadir=/data getblockheader ${parsed.bestblockhash}`
    );
    const header = JSON.parse(headerRaw);

    const payload = {
      height: header.height,
      hash: header.hash,
      previousBlockHash: header.previousblockhash ?? header.hash,
      merkleRoot: header.merkleroot,
      timestamp: header.time,
      bits: header.bits,
      nonce: header.nonce,
      difficulty: header.difficulty,
      chain: parsed.chain === 'main' ? 'main' : parsed.chain === 'regtest' ? 'regtest' : 'test',
    };

    const validated = BlockHeaderTruthSchema.parse(payload);
    this.blockCache = { data: validated, expiresAt: now + this.cacheTtlMs };
    return validated;
  }

  async getLightningTopology(): Promise<LightningTopologySignal> {
    return {
      activeChannels: 0,
      totalCapacitySats: 0,
      gossipUpdatesPerMinute: 42,
      routingFeeMedianPpm: 250,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  private async executeLndCommand(cmd: string): Promise<string> {
    const lndContainer = this.config.lndContainerName || 'sovereign-lnd';
    const isLocal = this.config.tailscaleHost === '127.0.0.1' || this.config.tailscaleHost === 'localhost';
    const baseCmd = `docker exec ${lndContainer} lncli --tlscertpath=/var/lib/lnd/data/tls.cert --macaroonpath=/var/lib/lnd/data/data/chain/bitcoin/mainnet/readonly.macaroon ${cmd}`;
    const fullCommand = isLocal
      ? baseCmd
      : `ssh -o ConnectTimeout=5 -o BatchMode=yes root@${this.config.tailscaleHost} "${baseCmd}"`;
    const { stdout, stderr } = await execAsync(fullCommand, { maxBuffer: 4 * 1024 * 1024 });
    if (stderr && !stdout) {
      throw new Error(`LND RPC Error: ${stderr}`);
    }
    return stdout.trim();
  }

  async getLightningNetworkStats(): Promise<LightningNetworkStats> {
    const now = Date.now();
    if (this.lightningStatsCache && this.lightningStatsCache.expiresAt > now) {
      return this.lightningStatsCache.data;
    }

    const rawOutput = await this.executeLndCommand('getnetworkinfo');
    const parsed = JSON.parse(rawOutput);
    const totalCapacity = Number.parseInt(String(parsed.total_network_capacity ?? '0'), 10);

    const validated = LightningNetworkStatsSchema.parse({
      channel_count: Number(parsed.num_channels ?? 0),
      node_count: Number(parsed.num_nodes ?? 0),
      total_capacity_sats: Number.isFinite(totalCapacity) ? totalCapacity : 0,
      avg_fee_rate_ppm: Number(parsed.avg_fee_rate_ppm ?? 0),
      med_fee_rate_ppm: Number(parsed.med_fee_rate_ppm ?? 0),
      updatedAt: Math.floor(now / 1000),
    });

    this.lightningStatsCache = { data: validated, expiresAt: now + 30_000 };
    return validated;
  }
}
