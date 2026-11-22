import {
  SUPPORTED_SYMBOLS,
  type FundingArbSnapshot,
  type FundingVenueRate,
  type MicrostructureSnapshot,
  type SupportedSymbol,
} from '../../domain/schemas/market-intel.schema.js';
import { ManagedWebSocket } from './ws-reconnect.helper.js';

interface SpotQuoteState {
  mid: number | null;
  lastUpdateMs: number;
}

const STALE_MS = 30_000;

export class SpotPriceIngestor {
  private readonly quotes = new Map<SupportedSymbol, SpotQuoteState>();
  private readonly socket: ManagedWebSocket;

  constructor() {
    for (const symbol of SUPPORTED_SYMBOLS) {
      this.quotes.set(symbol, { mid: null, lastUpdateMs: 0 });
    }
    const streams = SUPPORTED_SYMBOLS.map((s) => `${s.toLowerCase()}usdt@bookTicker`).join('/');
    this.socket = new ManagedWebSocket({
      url: `wss://stream.binance.com:9443/stream?streams=${streams}`,
      onMessage: (raw) => this.handleMessage(raw),
    });
  }

  start(): void {
    this.socket.start();
  }

  stop(): void {
    this.socket.stop();
  }

  getSpotMid(symbol: SupportedSymbol, now: number = Date.now()): number | null {
    const state = this.quotes.get(symbol);
    if (!state || state.mid === null || state.lastUpdateMs === 0) return null;
    if (now - state.lastUpdateMs > STALE_MS) return null;
    return state.mid;
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const d = msg?.data;
    const rawSym = String(d?.s || '').toUpperCase();
    const symbol = SUPPORTED_SYMBOLS.find((s) => rawSym === `${s}USDT`);
    if (!symbol) return;
    const bid = Number(d.b);
    const ask = Number(d.a);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
    const state = this.quotes.get(symbol)!;
    state.mid = Math.round(((bid + ask) / 2) * 100) / 100;
    state.lastUpdateMs = Date.now();
  }
}

export function computeFundingArbSnapshot(
  symbol: SupportedSymbol,
  spotMidUsd: number | null,
  micro: MicrostructureSnapshot,
  now: number = Date.now(),
): FundingArbSnapshot {
  const t0 = performance.now();
  const venues: FundingVenueRate[] = [];

  for (const q of micro.venues) {
    if (q.stale || q.fundingRateBps === null) continue;
    const fundingRate8hBps = Math.round(q.fundingRateBps * 1000) / 1000;
    const fundingAprPct = Math.round((fundingRate8hBps / 100) * 3 * 365 * 100) / 100;
    const basisBps =
      spotMidUsd && q.mid
        ? Math.round(((q.mid - spotMidUsd) / spotMidUsd) * 10_000 * 100) / 100
        : null;
    venues.push({
      venue: q.venue,
      mid: q.mid,
      fundingRate8hBps,
      fundingAprPct,
      basisBps,
      ageMs: q.ageMs,
    });
  }

  let bestCarry: FundingArbSnapshot['bestCarry'] = null;
  if (venues.length >= 2) {
    const sorted = [...venues].sort((a, b) => a.fundingRate8hBps - b.fundingRate8hBps);
    const lowest = sorted[0]!;
    const highest = sorted[sorted.length - 1]!;
    const spreadBpsPer8h = Math.round((highest.fundingRate8hBps - lowest.fundingRate8hBps) * 1000) / 1000;
    const annualizedAprPct = Math.round((spreadBpsPer8h / 100) * 3 * 365 * 100) / 100;
    bestCarry = {
      longVenue: lowest.venue,
      shortVenue: highest.venue,
      spreadBpsPer8h,
      annualizedAprPct,
    };
  }

  const spotPerpBasisBps =
    spotMidUsd && micro.midPriceUsd
      ? Math.round(((micro.midPriceUsd - spotMidUsd) / spotMidUsd) * 10_000 * 100) / 100
      : null;

  return {
    symbol,
    timestamp: new Date(now).toISOString(),
    computedInMs: Math.round((performance.now() - t0) * 1000) / 1000,
    spotMidUsd,
    perpMidUsd: micro.midPriceUsd,
    spotPerpBasisBps,
    bestCarry,
    venues,
    sourcesActive: venues.map((v) => v.venue),
  };
}
