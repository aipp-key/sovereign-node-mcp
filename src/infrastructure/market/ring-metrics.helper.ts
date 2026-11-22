import type { ExchangeVenue, VenueQuote } from '../../domain/schemas/market-intel.schema.js';

interface TradeEntry {
  ts: number;
  signedCents: number;
  absCents: number;
}

interface LiquidationEntry {
  ts: number;
  cents: number;
  side: 'long' | 'short';
}

const FIVE_MIN_MS = 5 * 60_000;
const ONE_MIN_MS = 60_000;
const MAX_BUFFER_ITEMS = 10_000;

/** Fixed-horizon rolling trade window using integer USD cents to avoid float drift. */
export class RollingTradeWindow {
  private readonly entries: TradeEntry[] = [];

  record(price: number, qty: number, isBuy: boolean, ts: number = Date.now()): void {
    if (!Number.isFinite(price) || !Number.isFinite(qty) || price <= 0 || qty <= 0) return;
    const cents = Math.round(price * qty * 100);
    if (cents <= 0) return;
    this.entries.push({ ts, signedCents: isBuy ? cents : -cents, absCents: cents });
    if (this.entries.length > MAX_BUFFER_ITEMS) {
      this.entries.splice(0, this.entries.length - MAX_BUFFER_ITEMS);
    }
  }

  prune(now: number = Date.now()): void {
    const cutoff = now - FIVE_MIN_MS;
    let drop = 0;
    while (drop < this.entries.length && this.entries[drop]!.ts < cutoff) {
      drop += 1;
    }
    if (drop > 0) this.entries.splice(0, drop);
  }

  summary(now: number = Date.now()): { cvd1mUsd: number; cvd5mUsd: number; volume1mUsd: number } {
    this.prune(now);
    const oneMinCutoff = now - ONE_MIN_MS;
    let cvd1mCents = 0;
    let cvd5mCents = 0;
    let vol1mCents = 0;

    for (const item of this.entries) {
      cvd5mCents += item.signedCents;
      if (item.ts >= oneMinCutoff) {
        cvd1mCents += item.signedCents;
        vol1mCents += item.absCents;
      }
    }

    return {
      cvd1mUsd: Math.round(cvd1mCents) / 100,
      cvd5mUsd: Math.round(cvd5mCents) / 100,
      volume1mUsd: Math.round(vol1mCents) / 100,
    };
  }
}

/** Fixed-horizon rolling liquidation window producing a 0-100 cascade score. */
export class RollingLiquidationWindow {
  private readonly entries: LiquidationEntry[] = [];

  record(price: number, qty: number, side: 'long' | 'short', ts: number = Date.now()): void {
    if (!Number.isFinite(price) || !Number.isFinite(qty) || price <= 0 || qty <= 0) return;
    const cents = Math.round(price * qty * 100);
    if (cents <= 0) return;
    this.entries.push({ ts, cents, side });
    if (this.entries.length > MAX_BUFFER_ITEMS) {
      this.entries.splice(0, this.entries.length - MAX_BUFFER_ITEMS);
    }
  }

  prune(now: number = Date.now()): void {
    const cutoff = now - FIVE_MIN_MS;
    let drop = 0;
    while (drop < this.entries.length && this.entries[drop]!.ts < cutoff) {
      drop += 1;
    }
    if (drop > 0) this.entries.splice(0, drop);
  }

  summary(now: number = Date.now()): {
    longLiq5mUsd: number;
    shortLiq5mUsd: number;
    totalLiq5mUsd: number;
    cascadeScore: number;
  } {
    this.prune(now);
    let longCents = 0;
    let shortCents = 0;
    for (const item of this.entries) {
      if (item.side === 'long') longCents += item.cents;
      else shortCents += item.cents;
    }
    const longLiq5mUsd = Math.round(longCents) / 100;
    const shortLiq5mUsd = Math.round(shortCents) / 100;
    const totalLiq5mUsd = Math.round(longCents + shortCents) / 100;
    // Scale smoothly from $0 -> 0 up to ~$10M 5m liquidations -> 100.
    const cascadeScore =
      totalLiq5mUsd <= 0
        ? 0
        : Math.min(100, Math.round((Math.log10(1 + totalLiq5mUsd) / 7) * 100));

    return { longLiq5mUsd, shortLiq5mUsd, totalLiq5mUsd, cascadeScore };
  }
}

export function computeOrderbookImbalance(
  bids: readonly [number, number][],
  asks: readonly [number, number][],
  levels: number = 10,
): number | null {
  let bidVol = 0;
  let askVol = 0;
  for (const [price, qty] of bids.slice(0, levels)) {
    if (price > 0 && qty > 0) bidVol += price * qty;
  }
  for (const [price, qty] of asks.slice(0, levels)) {
    if (price > 0 && qty > 0) askVol += price * qty;
  }
  const total = bidVol + askVol;
  if (total <= 0) return null;
  return Math.round(((bidVol - askVol) / total) * 10_000) / 10_000;
}

export function computeCrossExchangeSpreadBps(quotes: readonly VenueQuote[]): number | null {
  const mids = quotes
    .filter((q) => !q.stale && q.mid !== null && q.mid > 0)
    .map((q) => q.mid as number);
  if (mids.length === 0) return null;
  if (mids.length === 1) {
    const q = quotes.find((item) => !item.stale && item.bestBid && item.bestAsk);
    if (!q || !q.bestBid || !q.bestAsk) return 0;
    const mid = (q.bestBid + q.bestAsk) / 2;
    return Math.round(((q.bestAsk - q.bestBid) / mid) * 10_000 * 100) / 100;
  }
  const minMid = Math.min(...mids);
  const maxMid = Math.max(...mids);
  const avgMid = (minMid + maxMid) / 2;
  return Math.round(((maxMid - minMid) / avgMid) * 10_000 * 100) / 100;
}

export function computeRobustMidPrice(
  quotes: readonly VenueQuote[],
  maxDeviationPct: number = 1.5,
): { midPriceUsd: number | null; cleanQuotes: VenueQuote[]; outlierSources: ExchangeVenue[] } {
  const active = quotes.filter((q) => !q.stale && q.mid !== null && q.mid > 0);
  if (active.length === 0) {
    return { midPriceUsd: null, cleanQuotes: [], outlierSources: [] };
  }

  const medianOf = (vals: number[]): number => {
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  };

  const initialMedian = medianOf(active.map((q) => q.mid as number));
  if (active.length < 3) {
    return {
      midPriceUsd: Math.round(initialMedian * 100) / 100,
      cleanQuotes: active,
      outlierSources: [],
    };
  }

  const cleanQuotes: VenueQuote[] = [];
  const outlierSources: ExchangeVenue[] = [];
  for (const quote of active) {
    const deviationPct = (Math.abs((quote.mid as number) - initialMedian) / initialMedian) * 100;
    if (deviationPct > maxDeviationPct) outlierSources.push(quote.venue);
    else cleanQuotes.push(quote);
  }

  const finalQuotes = cleanQuotes.length > 0 ? cleanQuotes : active;
  const finalMedian = medianOf(finalQuotes.map((q) => q.mid as number));
  return {
    midPriceUsd: Math.round(finalMedian * 100) / 100,
    cleanQuotes: finalQuotes,
    outlierSources,
  };
}
