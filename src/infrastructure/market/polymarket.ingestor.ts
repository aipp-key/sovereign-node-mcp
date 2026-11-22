import type {
  PolymarketEdgeItem,
  PolymarketEdgeSnapshot,
  SupportedSymbol,
} from '../../domain/schemas/market-intel.schema.js';
import type { ExchangeWsIngestor } from './exchange-ws.ingestor.js';
import { ManagedWebSocket } from './ws-reconnect.helper.js';

interface TrackedMarket {
  marketId: string;
  slug: string;
  question: string;
  asset: SupportedSymbol;
  yesTokenId: string;
  yesProbability: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  volume24hUsd: number;
  endDate: string | null;
  lastUpdatedMs: number;
}

const GAMMA_URL =
  'https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=crypto&order=volume24hr&ascending=false&limit=25';
const GAMMA_SYNC_MS = 60_000;

function detectAsset(question: string, slug: string): SupportedSymbol | null {
  const text = `${question} ${slug}`;
  if (/\b(bitcoin|btc)\b/i.test(text)) return 'BTC';
  if (/\b(ethereum|eth)\b/i.test(text)) return 'ETH';
  if (/\b(solana|sol)\b/i.test(text)) return 'SOL';
  return null;
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export class PolymarketIngestor {
  private readonly marketsByToken = new Map<string, TrackedMarket>();
  private readonly socket: ManagedWebSocket;
  private syncTimer: NodeJS.Timeout | null = null;
  private lastGammaSyncAt: string | null = null;
  private subscribedKey = '';
  private stopped = false;

  constructor(private readonly exchangeIngestor: ExchangeWsIngestor) {
    this.socket = new ManagedWebSocket({
      url: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
      pingIntervalMs: 20_000,
      pingPayload: 'PING',
      maxFrameChars: 262_144,
      staleTimeoutMs: 60_000,
      onOpen: () => this.sendSubscription(true),
      onMessage: (raw) => this.handleClobMessage(raw),
    });
  }

  start(): void {
    this.stopped = false;
    this.socket.start();
    void this.syncGammaMarkets();
    this.syncTimer = setInterval(() => {
      void this.syncGammaMarkets();
    }, GAMMA_SYNC_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.socket.stop();
  }

  getSnapshot(assetFilter?: SupportedSymbol, now: number = Date.now()): PolymarketEdgeSnapshot {
    const t0 = performance.now();
    const list = [...this.marketsByToken.values()]
      .filter((m) => !assetFilter || m.asset === assetFilter)
      .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
      .slice(0, 12);

    const spotCache = new Map<SupportedSymbol, { mid: number | null; imb: number | null }>();
    const markets: PolymarketEdgeItem[] = list.map((m) => {
      let ref = spotCache.get(m.asset);
      if (!ref) {
        const snap = this.exchangeIngestor.getSnapshot(m.asset, now);
        ref = { mid: snap.midPriceUsd, imb: snap.orderbookImbalance };
        spotCache.set(m.asset, ref);
      }
      const spreadBps =
        m.bestBid !== null && m.bestAsk !== null && m.bestAsk >= m.bestBid && (m.bestBid + m.bestAsk) > 0
          ? Math.round(((m.bestAsk - m.bestBid) / ((m.bestBid + m.bestAsk) / 2)) * 10_000)
          : null;
      return {
        marketId: m.marketId,
        slug: m.slug,
        question: m.question,
        asset: m.asset,
        yesTokenId: m.yesTokenId,
        yesProbability: m.yesProbability,
        bestBid: m.bestBid,
        bestAsk: m.bestAsk,
        spreadBps,
        volume24hUsd: m.volume24hUsd,
        endDate: m.endDate,
        spotReferenceUsd: ref.mid,
        spotOrderbookImbalance: ref.imb,
        ageMs: m.lastUpdatedMs > 0 ? Math.max(0, now - m.lastUpdatedMs) : null,
      };
    });

    return {
      timestamp: new Date(now).toISOString(),
      computedInMs: Math.round((performance.now() - t0) * 1000) / 1000,
      assetFilter: assetFilter ?? null,
      wsConnected: this.socket.isOpen(),
      lastGammaSyncAt: this.lastGammaSyncAt,
      trackedMarketsCount: this.marketsByToken.size,
      markets,
    };
  }

  private async syncGammaMarkets(): Promise<void> {
    if (this.stopped) return;
    try {
      const res = await fetch(GAMMA_URL, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return;
      const events = (await res.json()) as any[];
      if (!Array.isArray(events) || this.stopped) return;
      const rows = events.flatMap((event) => (Array.isArray(event?.markets) ? event.markets : []));

      const freshTokens = new Set<string>();
      for (const row of rows) {
        if (!row?.active || row?.closed) continue;
        const question = String(row?.question || '');
        const slug = String(row?.slug || '');
        const asset = detectAsset(question, slug);
        if (!asset) continue;
        const tokenIds = parseJsonArray(row?.clobTokenIds);
        const yesTokenId = tokenIds[0];
        if (!yesTokenId) continue;
        freshTokens.add(yesTokenId);

        const prices = parseJsonArray(row?.outcomePrices);
        const gammaYes = prices[0] !== undefined ? Number(prices[0]) : NaN;
        const existing = this.marketsByToken.get(yesTokenId);

        this.marketsByToken.set(yesTokenId, {
          marketId: String(row.id ?? yesTokenId),
          slug,
          question,
          asset,
          yesTokenId,
          yesProbability: existing?.yesProbability ?? (Number.isFinite(gammaYes) ? gammaYes : null),
          bestBid: existing?.bestBid ?? null,
          bestAsk: existing?.bestAsk ?? null,
          volume24hUsd: Math.round(Number(row?.volume24hr || row?.volumeNum || 0)),
          endDate: typeof row?.endDate === 'string' ? row.endDate : null,
          lastUpdatedMs: existing?.lastUpdatedMs ?? Date.now(),
        });
      }

      for (const tokenId of this.marketsByToken.keys()) {
        if (!freshTokens.has(tokenId)) this.marketsByToken.delete(tokenId);
      }

      this.lastGammaSyncAt = new Date().toISOString();
      this.sendSubscription(false);
    } catch {
      // Retain previously cached markets if Gamma sync temporarily fails.
    }
  }

  private sendSubscription(force: boolean): void {
    const ids = [...this.marketsByToken.keys()].slice(0, 24);
    if (ids.length === 0) return;
    const key = ids.join(',');
    if (!force && key === this.subscribedKey) return;
    if (this.socket.send(JSON.stringify({ assets_ids: ids, type: 'market' }))) {
      this.subscribedKey = key;
    }
  }

  private handleClobMessage(raw: string): void {
    if (raw === 'PONG' || raw === 'pong') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const evt of events) {
      if (!evt || typeof evt !== 'object') continue;
      const e = evt as any;
      if (e.event_type === 'book' && typeof e.asset_id === 'string') {
        const m = this.marketsByToken.get(e.asset_id);
        if (!m) continue;
        const bid = Array.isArray(e.bids) && e.bids[0] ? Number(e.bids[0].price) : null;
        const ask = Array.isArray(e.asks) && e.asks[0] ? Number(e.asks[0].price) : null;
        if (bid !== null && Number.isFinite(bid)) m.bestBid = bid;
        if (ask !== null && Number.isFinite(ask)) m.bestAsk = ask;
        if (m.bestBid !== null && m.bestAsk !== null) {
          m.yesProbability = Math.round(((m.bestBid + m.bestAsk) / 2) * 10_000) / 10_000;
        }
        m.lastUpdatedMs = Date.now();
      } else if (e.event_type === 'price_change' && Array.isArray(e.price_changes)) {
        for (const ch of e.price_changes) {
          const m = typeof ch?.asset_id === 'string' ? this.marketsByToken.get(ch.asset_id) : null;
          if (!m) continue;
          const bid = ch.best_bid !== undefined ? Number(ch.best_bid) : null;
          const ask = ch.best_ask !== undefined ? Number(ch.best_ask) : null;
          const px = ch.price !== undefined ? Number(ch.price) : null;
          if (bid !== null && Number.isFinite(bid)) m.bestBid = bid;
          if (ask !== null && Number.isFinite(ask)) m.bestAsk = ask;
          if (m.bestBid !== null && m.bestAsk !== null) {
            m.yesProbability = Math.round(((m.bestBid + m.bestAsk) / 2) * 10_000) / 10_000;
          } else if (px !== null && Number.isFinite(px)) {
            m.yesProbability = Math.round(px * 10_000) / 10_000;
          }
          m.lastUpdatedMs = Date.now();
        }
      }
    }
  }
}
