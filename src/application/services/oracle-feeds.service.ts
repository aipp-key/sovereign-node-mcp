import type {
  EvmGasChain,
  GasPulseSnapshot,
  StablecoinPegSnapshot,
  StablecoinSymbol,
  WhaleTapeSnapshot,
} from '../../domain/schemas/oracle-feeds.schema.js';
import { BtcZmqWhaleIngestor } from '../../infrastructure/bitcoin/btc-zmq-whale.ingestor.js';
import { EvmGasPulseIngestor } from '../../infrastructure/evm/evm-gas-pulse.ingestor.js';
import { StablecoinPegIngestor } from '../../infrastructure/market/stablecoin-peg.ingestor.js';

export class OracleFeedsService {
  private readonly stablecoinIngestor: StablecoinPegIngestor;
  private readonly gasPulseIngestor: EvmGasPulseIngestor;
  private readonly whaleIngestor: BtcZmqWhaleIngestor;
  private started = false;

  constructor(
    stablecoinIngestor?: StablecoinPegIngestor,
    gasPulseIngestor?: EvmGasPulseIngestor,
    whaleIngestor?: BtcZmqWhaleIngestor,
  ) {
    this.stablecoinIngestor = stablecoinIngestor ?? new StablecoinPegIngestor();
    this.gasPulseIngestor = gasPulseIngestor ?? new EvmGasPulseIngestor();
    this.whaleIngestor = whaleIngestor ?? new BtcZmqWhaleIngestor();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (process.env.DISABLE_MARKET_INGESTORS === 'true') return;
    this.stablecoinIngestor.start();
    this.gasPulseIngestor.start();
    this.whaleIngestor.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.stablecoinIngestor.stop();
    this.gasPulseIngestor.stop();
    this.whaleIngestor.stop();
  }

  getStablecoinPeg(symbol?: StablecoinSymbol): StablecoinPegSnapshot {
    return this.stablecoinIngestor.getSnapshot(symbol);
  }

  getGasPulse(chain?: EvmGasChain): GasPulseSnapshot {
    return this.gasPulseIngestor.getSnapshot(chain);
  }

  getWhaleTape(minBtc?: number, limit?: number): WhaleTapeSnapshot {
    return this.whaleIngestor.getSnapshot(minBtc, limit);
  }
}
