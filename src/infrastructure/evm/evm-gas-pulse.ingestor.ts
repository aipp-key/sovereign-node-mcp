import {
  EVM_GAS_CHAINS,
  type ChainGasPulse,
  type EvmGasChain,
  type GasCongestion,
  type GasPulseSnapshot,
  type GasTrend,
} from '../../domain/schemas/oracle-feeds.schema.js';
import { ManagedWebSocket } from '../market/ws-reconnect.helper.js';

interface ChainSpec {
  chain: EvmGasChain;
  chainId: number;
  url: string;
}

interface ChainGasState {
  chainId: number;
  blockNumber: number | null;
  baseFeeGwei: number | null;
  blobBaseFeeGwei: number | null;
  gasUtilizationPct: number | null;
  history: number[];
  lastUpdateMs: number;
}

const CHAIN_SPECS: readonly ChainSpec[] = [
  { chain: 'ethereum', chainId: 1, url: process.env.ETH_WS_URL || 'wss://ethereum-rpc.publicnode.com' },
  { chain: 'base', chainId: 8453, url: process.env.BASE_WS_URL || 'wss://base-rpc.publicnode.com' },
  { chain: 'arbitrum', chainId: 42161, url: process.env.ARBITRUM_WS_URL || 'wss://arbitrum-one-rpc.publicnode.com' },
];

const MAX_HISTORY = 12;
const STALE_MS = 120_000;
const MIN_BLOB_BASE_FEE = 1n;
const BLOB_UPDATE_FRACTION = 3_338_477n;

function parseHexBigInt(hex: unknown): bigint | null {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(hex)) return null;
  return BigInt(hex);
}

/** Converts wei to Gwei with 4 decimal places using BigInt integer division. */
export function weiToGwei(wei: bigint): number {
  const scaled = (wei * 10_000n) / 1_000_000_000n;
  return Number(scaled) / 10_000;
}

/** EIP-4844 integer fakeExponential approximation for excessBlobGas -> wei. */
export function computeBlobBaseFeeWei(excessBlobGas: bigint): bigint {
  let i = 1n;
  let output = 0n;
  let numeratorAccum = MIN_BLOB_BASE_FEE * BLOB_UPDATE_FRACTION;
  while (numeratorAccum > 0n) {
    output += numeratorAccum;
    numeratorAccum = (numeratorAccum * excessBlobGas) / (BLOB_UPDATE_FRACTION * i);
    i += 1n;
    if (i > 48n) break;
  }
  return output / BLOB_UPDATE_FRACTION;
}

function classifyTrend(history: number[]): { trend: GasTrend; changePct: number | null } {
  if (history.length < 3) return { trend: 'WARMING_UP', changePct: null };
  const first = history[0]!;
  const last = history[history.length - 1]!;
  if (first <= 0) return { trend: 'STEADY', changePct: 0 };
  const pct = Math.round(((last - first) / first) * 10_000) / 100;
  const trend: GasTrend = pct >= 5 ? 'RISING' : pct <= -5 ? 'FALLING' : 'STEADY';
  return { trend, changePct: pct };
}

function classifyCongestion(utilPct: number | null): GasCongestion {
  if (utilPct === null) return 'UNKNOWN';
  if (utilPct >= 75) return 'HIGH';
  if (utilPct >= 45) return 'MODERATE';
  return 'LOW';
}

export class EvmGasPulseIngestor {
  private readonly states = new Map<EvmGasChain, ChainGasState>();
  private readonly sockets = new Map<EvmGasChain, ManagedWebSocket>();

  constructor() {
    for (const spec of CHAIN_SPECS) {
      this.states.set(spec.chain, {
        chainId: spec.chainId,
        blockNumber: null,
        baseFeeGwei: null,
        blobBaseFeeGwei: null,
        gasUtilizationPct: null,
        history: [],
        lastUpdateMs: 0,
      });

      this.sockets.set(
        spec.chain,
        new ManagedWebSocket({
          url: spec.url,
          pingIntervalMs: 30_000,
          pingPayload: () => JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'eth_chainId', params: [] }),
          staleTimeoutMs: 60_000,
          onOpen: (ws) => {
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] }));
          },
          onMessage: (raw) => this.handleMessage(spec.chain, raw),
        })
      );
    }
  }

  start(): void {
    for (const ws of this.sockets.values()) ws.start();
  }

  stop(): void {
    for (const ws of this.sockets.values()) ws.stop();
  }

  recordHead(chain: EvmGasChain, header: Record<string, unknown>, now: number = Date.now()): void {
    const state = this.states.get(chain);
    if (!state) return;

    const numBig = parseHexBigInt(header.number);
    const baseFeeBig = parseHexBigInt(header.baseFeePerGas);
    const gasUsedBig = parseHexBigInt(header.gasUsed);
    const gasLimitBig = parseHexBigInt(header.gasLimit);
    const excessBlobBig = parseHexBigInt(header.excessBlobGas);

    if (numBig !== null) state.blockNumber = Number(numBig);
    if (baseFeeBig !== null) {
      const gwei = weiToGwei(baseFeeBig);
      state.baseFeeGwei = gwei;
      state.history.push(gwei);
      if (state.history.length > MAX_HISTORY) state.history.shift();
    }
    if (excessBlobBig !== null) {
      state.blobBaseFeeGwei = weiToGwei(computeBlobBaseFeeWei(excessBlobBig));
    }
    if (gasUsedBig !== null && gasLimitBig !== null && gasLimitBig > 0n) {
      const pctBps = Number((gasUsedBig * 10_000n) / gasLimitBig);
      state.gasUtilizationPct = Math.round(pctBps) / 100;
    }
    state.lastUpdateMs = now;
  }

  getSnapshot(chainFilter?: EvmGasChain, now: number = Date.now()): GasPulseSnapshot {
    const t0 = performance.now();
    const targets = chainFilter ? [chainFilter] : [...EVM_GAS_CHAINS];
    const chains: ChainGasPulse[] = [];
    let activeChainsCount = 0;

    for (const chain of targets) {
      const s = this.states.get(chain)!;
      const ageMs = s.lastUpdateMs > 0 ? Math.max(0, now - s.lastUpdateMs) : null;
      const isFresh = ageMs !== null && ageMs <= STALE_MS && s.baseFeeGwei !== null;
      if (isFresh) activeChainsCount += 1;
      const { trend, changePct } = classifyTrend(s.history);

      chains.push({
        chain,
        chainId: s.chainId,
        blockNumber: s.blockNumber,
        baseFeeGwei: s.baseFeeGwei,
        blobBaseFeeGwei: s.blobBaseFeeGwei,
        gasUtilizationPct: s.gasUtilizationPct,
        trend,
        changePctOverWindow: changePct,
        congestion: classifyCongestion(s.gasUtilizationPct),
        sampleBlocks: s.history.length,
        ageMs,
        wsConnected: this.sockets.get(chain)?.isOpen() ?? false,
      });
    }

    return {
      timestamp: new Date(now).toISOString(),
      computedInMs: Math.round((performance.now() - t0) * 1000) / 1000,
      chainFilter: chainFilter ?? null,
      activeChainsCount,
      chains,
    };
  }

  private handleMessage(chain: EvmGasChain, raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const header = msg?.params?.result;
    if (header && typeof header === 'object') {
      this.recordHead(chain, header as Record<string, unknown>, Date.now());
    }
  }
}
