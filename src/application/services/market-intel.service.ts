import type {
  FundingArbSnapshot,
  MicrostructureSnapshot,
  OptionsAsset,
  OptionsSkewSnapshot,
  PolymarketEdgeSnapshot,
  SupportedSymbol,
} from '../../domain/schemas/market-intel.schema.js';
import { DeribitOptionsIngestor } from '../../infrastructure/market/deribit-options.ingestor.js';
import { ExchangeWsIngestor } from '../../infrastructure/market/exchange-ws.ingestor.js';
import { PolymarketIngestor } from '../../infrastructure/market/polymarket.ingestor.js';
import {
  SpotPriceIngestor,
  computeFundingArbSnapshot,
} from '../../infrastructure/market/spot-price.ingestor.js';

export class MarketIntelService {
  private readonly exchangeIngestor: ExchangeWsIngestor;
  private readonly polymarketIngestor: PolymarketIngestor;
  private readonly spotIngestor: SpotPriceIngestor;
  private readonly deribitIngestor: DeribitOptionsIngestor;
  private started = false;

  constructor(
    exchangeIngestor?: ExchangeWsIngestor,
    polymarketIngestor?: PolymarketIngestor,
    spotIngestor?: SpotPriceIngestor,
    deribitIngestor?: DeribitOptionsIngestor,
  ) {
    this.exchangeIngestor = exchangeIngestor ?? new ExchangeWsIngestor();
    this.polymarketIngestor = polymarketIngestor ?? new PolymarketIngestor(this.exchangeIngestor);
    this.spotIngestor = spotIngestor ?? new SpotPriceIngestor();
    this.deribitIngestor = deribitIngestor ?? new DeribitOptionsIngestor();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (process.env.DISABLE_MARKET_INGESTORS === 'true') return;
    this.exchangeIngestor.start();
    this.polymarketIngestor.start();
    this.spotIngestor.start();
    this.deribitIngestor.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.polymarketIngestor.stop();
    this.exchangeIngestor.stop();
    this.spotIngestor.stop();
    this.deribitIngestor.stop();
  }

  getMicrostructure(symbol: SupportedSymbol): MicrostructureSnapshot {
    return this.exchangeIngestor.getSnapshot(symbol);
  }

  getPolymarketEdge(asset?: SupportedSymbol): PolymarketEdgeSnapshot {
    return this.polymarketIngestor.getSnapshot(asset);
  }

  getFundingArb(symbol: SupportedSymbol): FundingArbSnapshot {
    const now = Date.now();
    const micro = this.exchangeIngestor.getSnapshot(symbol, now);
    const spotMid = this.spotIngestor.getSpotMid(symbol, now);
    return computeFundingArbSnapshot(symbol, spotMid, micro, now);
  }

  getOptionsSkew(asset: OptionsAsset): OptionsSkewSnapshot {
    return this.deribitIngestor.getSnapshot(asset);
  }
}
