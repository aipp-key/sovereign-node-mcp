import {
  SUPPORTED_SYMBOLS,
  type ExchangeVenue,
  type MicrostructureSnapshot,
  type SupportedSymbol,
  type VenueQuote,
} from '../../domain/schemas/market-intel.schema.js';
import {
  RollingLiquidationWindow,
  RollingTradeWindow,
  computeCrossExchangeSpreadBps,
  computeOrderbookImbalance,
  computeRobustMidPrice,
} from './ring-metrics.helper.js';
import { ManagedWebSocket } from './ws-reconnect.helper.js';

interface VenueState {
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  imbalance: number | null;
  fundingRateBps: number | null;
  lastUpdateMs: number;
}

interface SymbolBook {
  trades: RollingTradeWindow;
  liquidations: RollingLiquidationWindow;
  venues: Map<ExchangeVenue, VenueState>;
}

const VENUES: readonly ExchangeVenue[] = ['binance', 'bybit', 'okx', 'hyperliquid'];
const OKX_CT_VAL: Record<SupportedSymbol, number> = { BTC: 0.01, ETH: 0.1, SOL: 1 };
const STALE_MS = 30_000;

function parseSymbol(raw: string | undefined): SupportedSymbol | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  for (const sym of SUPPORTED_SYMBOLS) {
    if (upper === sym || upper.startsWith(`${sym}USDT`) || upper.startsWith(`${sym}-USDT`)) {
      return sym;
    }
  }
  return null;
}

function toLevels(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const levels: [number, number][] = [];
  for (const entry of raw.slice(0, 10)) {
    if (Array.isArray(entry) && entry.length >= 2) {
      const px = Number(entry[0]);
      const sz = Number(entry[1]);
      if (Number.isFinite(px) && Number.isFinite(sz) && px > 0 && sz > 0) levels.push([px, sz]);
    } else if (entry && typeof entry === 'object') {
      const px = Number((entry as any).px);
      const sz = Number((entry as any).sz);
      if (Number.isFinite(px) && Number.isFinite(sz) && px > 0 && sz > 0) levels.push([px, sz]);
    }
  }
  return levels;
}

export class ExchangeWsIngestor {
  private readonly books = new Map<SupportedSymbol, SymbolBook>();
  private readonly sockets: ManagedWebSocket[];

  constructor() {
    for (const symbol of SUPPORTED_SYMBOLS) {
      const venues = new Map<ExchangeVenue, VenueState>();
      for (const venue of VENUES) {
        venues.set(venue, { bestBid: null, bestAsk: null, mid: null, imbalance: null, fundingRateBps: null, lastUpdateMs: 0 });
      }
      this.books.set(symbol, { trades: new RollingTradeWindow(), liquidations: new RollingLiquidationWindow(), venues });
    }

    const binanceStreams = SUPPORTED_SYMBOLS.flatMap((s) => {
      const p = `${s.toLowerCase()}usdt`;
      return [`${p}@aggTrade`, `${p}@depth10@100ms`, `${p}@markPrice@1s`, `${p}@forceOrder`];
    }).join('/');

    this.sockets = [
      new ManagedWebSocket({
        url: `wss://fstream.binance.com/stream?streams=${binanceStreams}`,
        onMessage: (raw) => this.handleBinance(raw),
      }),
      new ManagedWebSocket({
        url: 'wss://stream.bybit.com/v5/public/linear',
        pingIntervalMs: 20_000,
        pingPayload: () => JSON.stringify({ op: 'ping' }),
        onOpen: (ws) => this.subscribeBybit(ws),
        onMessage: (raw) => this.handleBybit(raw),
      }),
      new ManagedWebSocket({
        url: 'wss://ws.okx.com:8443/ws/v5/public',
        pingIntervalMs: 20_000,
        pingPayload: 'ping',
        onOpen: (ws) => this.subscribeOkx(ws),
        onMessage: (raw) => this.handleOkx(raw),
      }),
      new ManagedWebSocket({
        url: 'wss://api.hyperliquid.xyz/ws',
        pingIntervalMs: 30_000,
        pingPayload: () => JSON.stringify({ method: 'ping' }),
        onOpen: (ws) => this.subscribeHyperliquid(ws),
        onMessage: (raw) => this.handleHyperliquid(raw),
      }),
    ];
  }

  start(): void {
    for (const socket of this.sockets) socket.start();
  }

  stop(): void {
    for (const socket of this.sockets) socket.stop();
  }

  getSnapshot(symbol: SupportedSymbol, now: number = Date.now()): MicrostructureSnapshot {
    const t0 = performance.now();
    const book = this.books.get(symbol)!;
    const venues: VenueQuote[] = VENUES.map((venue) => {
      const s = book.venues.get(venue)!;
      const ageMs = s.lastUpdateMs > 0 ? Math.max(0, now - s.lastUpdateMs) : -1;
      const stale = s.lastUpdateMs === 0 || ageMs > STALE_MS;
      return {
        venue,
        bestBid: s.bestBid,
        bestAsk: s.bestAsk,
        mid: s.mid,
        imbalance: s.imbalance,
        fundingRateBps: s.fundingRateBps,
        ageMs,
        stale,
      };
    });

    const active = venues.filter((v) => !v.stale);
    const { midPriceUsd, cleanQuotes, outlierSources } = computeRobustMidPrice(venues);
    const imbs = cleanQuotes.map((v) => v.imbalance).filter((i): i is number => i !== null);
    const fundings = cleanQuotes.map((v) => v.fundingRateBps).filter((f): f is number => f !== null);
    const ages = active.map((v) => v.ageMs).filter((a) => a >= 0);
    const tradeSummary = book.trades.summary(now);
    const liqSummary = book.liquidations.summary(now);
    const avg = (arr: number[], d: number) =>
      arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * d) / d : null;
    return {
      symbol,
      timestamp: new Date(now).toISOString(),
      computedInMs: Math.round((performance.now() - t0) * 1000) / 1000,
      midPriceUsd,
      crossExchangeSpreadBps: computeCrossExchangeSpreadBps(cleanQuotes),
      orderbookImbalance: avg(imbs, 10_000),
      cvd1mUsd: tradeSummary.cvd1mUsd,
      cvd5mUsd: tradeSummary.cvd5mUsd,
      volume1mUsd: tradeSummary.volume1mUsd,
      avgFundingRateBps: avg(fundings, 10_000),
      liquidationCascadeScore: liqSummary.cascadeScore,
      longLiq5mUsd: liqSummary.longLiq5mUsd,
      shortLiq5mUsd: liqSummary.shortLiq5mUsd,
      maxAgeMs: ages.length ? Math.max(...ages) : null,
      sourcesActive: active.map((v) => v.venue),
      staleSources: venues.filter((v) => v.stale).map((v) => v.venue),
      outlierSources,
      venues,
    };
  }

  private updateBook(symbol: SupportedSymbol, venue: ExchangeVenue, bids: [number, number][], asks: [number, number][]): void {
    const state = this.books.get(symbol)!.venues.get(venue)!;
    const bestBid = bids[0]?.[0] ?? state.bestBid;
    const bestAsk = asks[0]?.[0] ?? state.bestAsk;
    state.bestBid = bestBid;
    state.bestAsk = bestAsk;
    if (bestBid && bestAsk) state.mid = Math.round(((bestBid + bestAsk) / 2) * 100) / 100;
    const imb = computeOrderbookImbalance(bids, asks);
    if (imb !== null) state.imbalance = imb;
    state.lastUpdateMs = Date.now();
  }

  private subscribeBybit(ws: WebSocket): void {
    const args = SUPPORTED_SYMBOLS.flatMap((s) => [`orderbook.1.${s}USDT`, `publicTrade.${s}USDT`, `tickers.${s}USDT`, `allLiquidation.${s}USDT`]);
    for (let i = 0; i < args.length; i += 6) ws.send(JSON.stringify({ op: 'subscribe', args: args.slice(i, i + 6) }));
  }

  private subscribeOkx(ws: WebSocket): void {
    const args = SUPPORTED_SYMBOLS.flatMap((s) => ['books5', 'trades', 'funding-rate'].map((channel) => ({ channel, instId: `${s}-USDT-SWAP` })));
    ws.send(JSON.stringify({ op: 'subscribe', args }));
  }

  private subscribeHyperliquid(ws: WebSocket): void {
    ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }));
    for (const coin of SUPPORTED_SYMBOLS) {
      ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin } }));
      ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }));
    }
  }

  private handleBinance(raw: string): void {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    const d = msg?.data;
    const stream = String(msg?.stream || '');
    if (!d) return;
    const sym = parseSymbol(d.s || d.o?.s || stream.split('@')[0]);
    if (!sym) return;
    const book = this.books.get(sym)!;
    if (stream.includes('@aggTrade')) {
      book.trades.record(Number(d.p), Number(d.q), !d.m, Number(d.T) || Date.now());
    } else if (stream.includes('@depth')) {
      this.updateBook(sym, 'binance', toLevels(d.b ?? d.bids), toLevels(d.a ?? d.asks));
    } else if (stream.includes('@markPrice')) {
      const s = book.venues.get('binance')!;
      if (d.r !== undefined) s.fundingRateBps = Math.round(Number(d.r) * 10_000 * 1000) / 1000;
      if (d.p && !s.mid) s.mid = Number(d.p);
      s.lastUpdateMs = Date.now();
    } else if (stream.includes('@forceOrder') && d.o) {
      book.liquidations.record(Number(d.o.ap || d.o.p), Number(d.o.q), d.o.S === 'SELL' ? 'long' : 'short');
    }
  }

  private handleBybit(raw: string): void {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    const topic = String(msg?.topic || '');
    const d = msg?.data;
    if (!topic || !d) return;
    const sym = parseSymbol(topic.split('.').pop());
    if (!sym) return;
    const book = this.books.get(sym)!;
    if (topic.startsWith('orderbook.')) {
      this.updateBook(sym, 'bybit', toLevels(d.b), toLevels(d.a));
    } else if (topic.startsWith('publicTrade.') && Array.isArray(d)) {
      for (const t of d) book.trades.record(Number(t.p), Number(t.v), t.S === 'Buy', Number(t.T) || Date.now());
    } else if (topic.startsWith('tickers.')) {
      const s = book.venues.get('bybit')!;
      if (d.fundingRate !== undefined) s.fundingRateBps = Math.round(Number(d.fundingRate) * 10_000 * 1000) / 1000;
      if (d.bid1Price) s.bestBid = Number(d.bid1Price);
      if (d.ask1Price) s.bestAsk = Number(d.ask1Price);
      if (s.bestBid && s.bestAsk) s.mid = Math.round(((s.bestBid + s.bestAsk) / 2) * 100) / 100;
      s.lastUpdateMs = Date.now();
    } else if (topic.startsWith('allLiquidation.') && Array.isArray(d)) {
      for (const l of d) book.liquidations.record(Number(l.p), Number(l.v), l.S === 'Buy' ? 'long' : 'short', Number(l.T) || Date.now());
    }
  }

  private handleOkx(raw: string): void {
    if (raw === 'pong') return;
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    const channel = msg?.arg?.channel;
    const data = Array.isArray(msg?.data) ? msg.data : null;
    if (!channel || !data) return;
    const sym = parseSymbol(msg.arg.instId);
    if (!sym) return;
    const book = this.books.get(sym)!;
    if (channel === 'books5' && data[0]) {
      this.updateBook(sym, 'okx', toLevels(data[0].bids), toLevels(data[0].asks));
    } else if (channel === 'trades') {
      const ctVal = OKX_CT_VAL[sym];
      for (const t of data) {
        book.trades.record(Number(t.px), Number(t.sz) * ctVal, t.side === 'buy', Number(t.ts) || Date.now());
      }
    } else if (channel === 'funding-rate' && data[0]?.fundingRate !== undefined) {
      const s = book.venues.get('okx')!;
      s.fundingRateBps = Math.round(Number(data[0].fundingRate) * 10_000 * 1000) / 1000;
      s.lastUpdateMs = Date.now();
    }
  }

  private handleHyperliquid(raw: string): void {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    const ch = msg?.channel;
    const d = msg?.data;
    if (!ch || !d) return;
    if (ch === 'allMids' && d.mids) {
      for (const sym of SUPPORTED_SYMBOLS) {
        const px = Number(d.mids[sym]);
        if (Number.isFinite(px) && px > 0) {
          const s = this.books.get(sym)!.venues.get('hyperliquid')!;
          s.mid = Math.round(px * 100) / 100;
          s.lastUpdateMs = Date.now();
        }
      }
    } else if (ch === 'l2Book' && Array.isArray(d.levels)) {
      const sym = parseSymbol(d.coin);
      if (sym) this.updateBook(sym, 'hyperliquid', toLevels(d.levels[0]), toLevels(d.levels[1]));
    } else if (ch === 'trades' && Array.isArray(d)) {
      for (const t of d) {
        const sym = parseSymbol(t.coin);
        if (sym) this.books.get(sym)!.trades.record(Number(t.px), Number(t.sz), t.side === 'B', Number(t.time) || Date.now());
      }
    }
  }
}
