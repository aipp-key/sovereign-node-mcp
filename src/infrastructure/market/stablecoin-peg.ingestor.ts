import {
  STABLECOIN_SYMBOLS,
  type PegStatus,
  type StablecoinAssetPeg,
  type StablecoinPegSnapshot,
  type StablecoinSymbol,
  type StablecoinVenue,
  type StablecoinVenueQuote,
} from '../../domain/schemas/oracle-feeds.schema.js';
import { ManagedWebSocket } from './ws-reconnect.helper.js';

interface RawVenuePrice {
  pair: string;
  priceUsd: number;
  updatedAtMs: number;
}

const STALE_MS = 60_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function classifyPeg(absBps: number | null): { status: PegStatus; riskScore: number } {
  if (absBps === null) return { status: 'UNKNOWN', riskScore: 0 };
  if (absBps < 15) return { status: 'PEGGED', riskScore: Math.round((absBps / 15) * 15) };
  if (absBps < 50) return { status: 'SLIGHT_DRIFT', riskScore: Math.round(15 + ((absBps - 15) / 35) * 35) };
  if (absBps < 200) return { status: 'DEPEG_WARNING', riskScore: Math.round(50 + ((absBps - 50) / 150) * 35) };
  return { status: 'CRITICAL_DEPEG', riskScore: Math.min(100, Math.round(85 + (absBps - 200) / 50)) };
}

export class StablecoinPegIngestor {
  private readonly quotes = new Map<StablecoinSymbol, Map<StablecoinVenue, RawVenuePrice>>();
  private readonly binanceCrossRates = new Map<'USDC' | 'USDE' | 'DAI', { rate: number; updatedAtMs: number }>();
  private readonly sockets: ManagedWebSocket[];

  constructor() {
    for (const sym of STABLECOIN_SYMBOLS) {
      this.quotes.set(sym, new Map());
    }

    this.sockets = [
      new ManagedWebSocket({
        url: 'wss://ws.kraken.com/v2',
        staleTimeoutMs: 45_000,
        onOpen: (ws) => {
          ws.send(
            JSON.stringify({
              method: 'subscribe',
              params: { channel: 'ticker', symbol: ['USDT/USD', 'USDC/USD', 'DAI/USD'] },
            })
          );
        },
        onMessage: (raw) => this.handleKraken(raw),
      }),
      new ManagedWebSocket({
        url: 'wss://ws-feed.exchange.coinbase.com',
        staleTimeoutMs: 45_000,
        onOpen: (ws) => {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              product_ids: ['USDT-USD', 'DAI-USD'],
              channels: ['ticker'],
            })
          );
        },
        onMessage: (raw) => this.handleCoinbase(raw),
      }),
      new ManagedWebSocket({
        url: 'wss://stream.binance.com:9443/stream?streams=usdcusdt@bookTicker/usdeusdt@bookTicker/daiusdt@bookTicker',
        staleTimeoutMs: 45_000,
        onMessage: (raw) => this.handleBinance(raw),
      }),
    ];
  }

  start(): void {
    for (const s of this.sockets) s.start();
  }

  stop(): void {
    for (const s of this.sockets) s.stop();
  }

  /** Allows tests or ingestors to inject normalized venue prices directly. */
  recordQuote(
    symbol: StablecoinSymbol,
    venue: StablecoinVenue,
    pair: string,
    priceUsd: number,
    now: number = Date.now()
  ): void {
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;
    this.quotes.get(symbol)?.set(venue, {
      pair,
      priceUsd: Math.round(priceUsd * 100_000) / 100_000,
      updatedAtMs: now,
    });
  }

  getSnapshot(symbolFilter?: StablecoinSymbol, now: number = Date.now()): StablecoinPegSnapshot {
    const t0 = performance.now();
    this.refreshBinanceCrossDerived(now);

    const targets = symbolFilter ? [symbolFilter] : [...STABLECOIN_SYMBOLS];
    const assets: StablecoinAssetPeg[] = [];
    let worstDepegBps: number | null = null;
    let activeAssetsCount = 0;

    for (const symbol of targets) {
      const venueMap = this.quotes.get(symbol);
      const venues: StablecoinVenueQuote[] = [];
      if (venueMap) {
        for (const [venue, q] of venueMap.entries()) {
          const ageMs = Math.max(0, now - q.updatedAtMs);
          if (ageMs <= STALE_MS) {
            venues.push({ venue, pair: q.pair, priceUsd: q.priceUsd, ageMs });
          }
        }
      }

      const pegPrice = median(venues.map((v) => v.priceUsd));
      const pegPriceUsd = pegPrice !== null ? Math.round(pegPrice * 100_000) / 100_000 : null;
      const deviationBps =
        pegPriceUsd !== null ? Math.round((pegPriceUsd - 1) * 10_000 * 100) / 100 : null;
      const absDeviationBps =
        deviationBps !== null ? Math.round(Math.abs(deviationBps) * 100) / 100 : null;
      const { status, riskScore } = classifyPeg(absDeviationBps);

      if (absDeviationBps !== null) {
        activeAssetsCount += 1;
        worstDepegBps = worstDepegBps === null ? absDeviationBps : Math.max(worstDepegBps, absDeviationBps);
      }

      assets.push({
        symbol,
        pegPriceUsd,
        deviationBps,
        absDeviationBps,
        depegRiskScore: riskScore,
        status,
        venues,
      });
    }

    const marketRegime: StablecoinPegSnapshot['marketRegime'] =
      worstDepegBps === null
        ? 'WARMING_UP'
        : worstDepegBps >= 50
          ? 'DEPEG_ALERT'
          : worstDepegBps >= 15
            ? 'STRESS'
            : 'CALM';

    return {
      timestamp: new Date(now).toISOString(),
      computedInMs: Math.round((performance.now() - t0) * 1000) / 1000,
      symbolFilter: symbolFilter ?? null,
      activeAssetsCount,
      worstDepegBps,
      marketRegime,
      assets,
    };
  }

  private getUsdtUsdReference(now: number): number {
    const usdtVenues = this.quotes.get('USDT');
    if (!usdtVenues) return 1.0;
    const fresh: number[] = [];
    for (const [venue, q] of usdtVenues.entries()) {
      if (venue !== 'binance' && now - q.updatedAtMs <= STALE_MS) {
        fresh.push(q.priceUsd);
      }
    }
    return median(fresh) ?? 1.0;
  }

  private refreshBinanceCrossDerived(now: number): void {
    const usdtUsd = this.getUsdtUsdReference(now);
    for (const [sym, entry] of this.binanceCrossRates.entries()) {
      if (now - entry.updatedAtMs <= STALE_MS) {
        this.recordQuote(sym, 'binance', `${sym}/USDT->USD`, entry.rate * usdtUsd, entry.updatedAtMs);
      }
    }
  }

  private handleKraken(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.channel !== 'ticker' || !Array.isArray(msg.data)) return;
    const now = Date.now();
    for (const item of msg.data) {
      const sym = String(item?.symbol || '').toUpperCase();
      const target: StablecoinSymbol | null =
        sym === 'USDT/USD' ? 'USDT' : sym === 'USDC/USD' ? 'USDC' : sym === 'DAI/USD' ? 'DAI' : null;
      if (!target) continue;
      const bid = Number(item.bid);
      const ask = Number(item.ask);
      const last = Number(item.last);
      const price = Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
      this.recordQuote(target, 'kraken', sym, price, now);
    }
  }

  private handleCoinbase(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type !== 'ticker') return;
    const prod = String(msg.product_id || '').toUpperCase();
    const target: StablecoinSymbol | null =
      prod === 'USDT-USD' ? 'USDT' : prod === 'DAI-USD' ? 'DAI' : null;
    if (!target) return;
    const bid = Number(msg.best_bid);
    const ask = Number(msg.best_ask);
    const last = Number(msg.price);
    const price = Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
    this.recordQuote(target, 'coinbase', prod, price, Date.now());
  }

  private handleBinance(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const d = msg?.data;
    const sym = String(d?.s || '').toUpperCase();
    const target: 'USDC' | 'USDE' | 'DAI' | null =
      sym === 'USDCUSDT' ? 'USDC' : sym === 'USDEUSDT' ? 'USDE' : sym === 'DAIUSDT' ? 'DAI' : null;
    if (!target) return;
    const bid = Number(d.b);
    const ask = Number(d.a);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
    this.binanceCrossRates.set(target, { rate: (bid + ask) / 2, updatedAtMs: Date.now() });
  }
}
