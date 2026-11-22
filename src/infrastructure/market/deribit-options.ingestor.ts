import {
  OPTIONS_ASSETS,
  type OptionsAsset,
  type OptionsSkewSnapshot,
  type VolatilityRegime,
} from '../../domain/schemas/market-intel.schema.js';
import { ManagedWebSocket } from './ws-reconnect.helper.js';

interface ChainSummary {
  underlyingUsd: number | null;
  atmIv: number | null;
  otmPutIv: number | null;
  otmCallIv: number | null;
  putCallSkewIv: number | null;
  putCallOiRatio: number | null;
  totalOptionsOi: number;
  activeContracts: number;
  lastChainSyncAt: string | null;
}

interface AssetState {
  dvol: number | null;
  dvolUpdatedMs: number;
  chain: ChainSummary;
}

const CHAIN_SYNC_MS = 60_000;
const EMPTY_CHAIN: ChainSummary = {
  underlyingUsd: null,
  atmIv: null,
  otmPutIv: null,
  otmCallIv: null,
  putCallSkewIv: null,
  putCallOiRatio: null,
  totalOptionsOi: 0,
  activeContracts: 0,
  lastChainSyncAt: null,
};

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(raw * 100) / 100;
}

export function summarizeDeribitChain(rows: unknown[], now: Date = new Date()): ChainSummary {
  const underlyings: number[] = [];
  let putOi = 0;
  let callOi = 0;
  let activeContracts = 0;
  const parsed: { strike: number; kind: 'C' | 'P'; iv: number }[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as any;
    const name = String(r.instrument_name || '');
    const match = name.match(/^[A-Z]+-\d{1,2}[A-Z]{3}\d{2}-(\d+(?:\.\d+)?)-([CP])$/);
    if (!match) continue;
    const oi = Number(r.open_interest || 0);
    const iv = Number(r.mark_iv || 0);
    const und = Number(r.underlying_price || 0);
    if (und > 0) underlyings.push(und);
    if (oi > 0) {
      activeContracts += 1;
      if (match[2] === 'P') putOi += oi;
      else callOi += oi;
    }
    if (iv > 0) {
      parsed.push({ strike: Number(match[1]), kind: match[2] as 'C' | 'P', iv });
    }
  }

  const underlyingUsd = medianOf(underlyings);
  const atmIvs: number[] = [];
  const otmPutIvs: number[] = [];
  const otmCallIvs: number[] = [];

  if (underlyingUsd && underlyingUsd > 0) {
    for (const opt of parsed) {
      const moneyness = opt.strike / underlyingUsd;
      if (moneyness >= 0.97 && moneyness <= 1.03) atmIvs.push(opt.iv);
      else if (opt.kind === 'P' && moneyness >= 0.85 && moneyness <= 0.93) otmPutIvs.push(opt.iv);
      else if (opt.kind === 'C' && moneyness >= 1.07 && moneyness <= 1.15) otmCallIvs.push(opt.iv);
    }
  }

  const atmIv = medianOf(atmIvs);
  const otmPutIv = medianOf(otmPutIvs);
  const otmCallIv = medianOf(otmCallIvs);
  const putCallSkewIv =
    otmPutIv !== null && otmCallIv !== null ? Math.round((otmPutIv - otmCallIv) * 100) / 100 : null;
  const putCallOiRatio = callOi > 0 ? Math.round((putOi / callOi) * 1000) / 1000 : null;

  return {
    underlyingUsd,
    atmIv,
    otmPutIv,
    otmCallIv,
    putCallSkewIv,
    putCallOiRatio,
    totalOptionsOi: Math.round((putOi + callOi) * 100) / 100,
    activeContracts,
    lastChainSyncAt: now.toISOString(),
  };
}

function classifyRegime(dvol: number | null): VolatilityRegime {
  if (dvol === null) return 'UNKNOWN';
  if (dvol < 45) return 'CALM';
  if (dvol < 65) return 'ELEVATED';
  return 'PANIC';
}

export class DeribitOptionsIngestor {
  private readonly state = new Map<OptionsAsset, AssetState>();
  private readonly socket: ManagedWebSocket;
  private syncTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor() {
    for (const asset of OPTIONS_ASSETS) {
      this.state.set(asset, { dvol: null, dvolUpdatedMs: 0, chain: { ...EMPTY_CHAIN } });
    }
    this.socket = new ManagedWebSocket({
      url: 'wss://www.deribit.com/ws/api/v2',
      pingIntervalMs: 25_000,
      pingPayload: () => JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'public/test', params: {} }),
      staleTimeoutMs: 45_000,
      onOpen: (ws) => {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'public/subscribe',
            params: {
              channels: ['deribit_volatility_index.btc_usd', 'deribit_volatility_index.eth_usd'],
            },
          }),
        );
      },
      onMessage: (raw) => this.handleMessage(raw),
    });
  }

  start(): void {
    this.stopped = false;
    this.socket.start();
    void this.syncAllChains();
    this.syncTimer = setInterval(() => {
      void this.syncAllChains();
    }, CHAIN_SYNC_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.socket.stop();
  }

  getSnapshot(asset: OptionsAsset, now: number = Date.now()): OptionsSkewSnapshot {
    const t0 = performance.now();
    const s = this.state.get(asset)!;
    const dvolAgeMs = s.dvolUpdatedMs > 0 ? Math.max(0, now - s.dvolUpdatedMs) : null;
    return {
      asset,
      timestamp: new Date(now).toISOString(),
      computedInMs: Math.round((performance.now() - t0) * 1000) / 1000,
      dvol: s.dvol,
      regime: classifyRegime(s.dvol),
      ...s.chain,
      wsConnected: this.socket.isOpen(),
      dvolAgeMs,
    };
  }

  private async syncAllChains(): Promise<void> {
    await Promise.all(OPTIONS_ASSETS.map((asset) => this.syncAssetChain(asset)));
  }

  private async syncAssetChain(asset: OptionsAsset): Promise<void> {
    if (this.stopped) return;
    try {
      const url = `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${asset}&kind=option`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return;
      const body = (await res.json()) as { result?: unknown[] };
      if (!Array.isArray(body?.result) || this.stopped) return;
      this.state.get(asset)!.chain = summarizeDeribitChain(body.result);
    } catch {
      // Retain last valid chain summary if Deribit REST temporarily fails.
    }
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.method !== 'subscription') return;
    const data = msg?.params?.data;
    const indexName = String(data?.index_name || '');
    const vol = Number(data?.volatility);
    if (!Number.isFinite(vol) || vol <= 0) return;

    const asset: OptionsAsset | null =
      indexName === 'btc_usd' ? 'BTC' : indexName === 'eth_usd' ? 'ETH' : null;
    if (!asset) return;

    const s = this.state.get(asset)!;
    s.dvol = Math.round(vol * 100) / 100;
    s.dvolUpdatedMs = Date.now();
  }
}
