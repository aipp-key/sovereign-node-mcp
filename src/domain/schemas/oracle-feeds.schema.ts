import { z } from 'zod';

export const STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'USDE', 'DAI'] as const;
export const StablecoinSymbolSchema = z.enum(STABLECOIN_SYMBOLS);
export type StablecoinSymbol = z.infer<typeof StablecoinSymbolSchema>;

export const StablecoinQuerySchema = z.object({
  symbol: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() ? val.trim().toUpperCase() : undefined),
    StablecoinSymbolSchema.optional()
  ),
});

export const EVM_GAS_CHAINS = ['ethereum', 'base', 'arbitrum'] as const;
export const EvmGasChainSchema = z.enum(EVM_GAS_CHAINS);
export type EvmGasChain = z.infer<typeof EvmGasChainSchema>;

export const GasPulseQuerySchema = z.object({
  chain: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() ? val.trim().toLowerCase() : undefined),
    EvmGasChainSchema.optional()
  ),
});

export const WhaleTapeQuerySchema = z.object({
  minBtc: z.preprocess(
    (val) => (val === undefined || val === '' ? 10 : Number(val)),
    z.number().min(1).max(10_000)
  ),
  limit: z.preprocess(
    (val) => (val === undefined || val === '' ? 25 : Number(val)),
    z.number().int().min(1).max(100)
  ),
});

export type StablecoinVenue = 'kraken' | 'coinbase' | 'binance';
export type PegStatus = 'PEGGED' | 'SLIGHT_DRIFT' | 'DEPEG_WARNING' | 'CRITICAL_DEPEG' | 'UNKNOWN';

export interface StablecoinVenueQuote {
  venue: StablecoinVenue;
  pair: string;
  priceUsd: number;
  ageMs: number;
}

export interface StablecoinAssetPeg {
  symbol: StablecoinSymbol;
  pegPriceUsd: number | null;
  deviationBps: number | null;
  absDeviationBps: number | null;
  depegRiskScore: number;
  status: PegStatus;
  venues: StablecoinVenueQuote[];
}

export interface StablecoinPegSnapshot {
  timestamp: string;
  computedInMs: number;
  symbolFilter: StablecoinSymbol | null;
  activeAssetsCount: number;
  worstDepegBps: number | null;
  marketRegime: 'CALM' | 'STRESS' | 'DEPEG_ALERT' | 'WARMING_UP';
  assets: StablecoinAssetPeg[];
}

export type GasTrend = 'RISING' | 'FALLING' | 'STEADY' | 'WARMING_UP';
export type GasCongestion = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';

export interface ChainGasPulse {
  chain: EvmGasChain;
  chainId: number;
  blockNumber: number | null;
  baseFeeGwei: number | null;
  blobBaseFeeGwei: number | null;
  gasUtilizationPct: number | null;
  trend: GasTrend;
  changePctOverWindow: number | null;
  congestion: GasCongestion;
  sampleBlocks: number;
  ageMs: number | null;
  wsConnected: boolean;
}

export interface GasPulseSnapshot {
  timestamp: string;
  computedInMs: number;
  chainFilter: EvmGasChain | null;
  activeChainsCount: number;
  chains: ChainGasPulse[];
}

export interface WhaleTxEvent {
  txid: string;
  totalOutputSats: string;
  totalOutputBtc: number;
  outputCount: number;
  inputCount: number;
  vsize: number;
  segwit: boolean;
  seenAt: string;
  ageMs: number;
}

export interface WhaleTapeSnapshot {
  timestamp: string;
  computedInMs: number;
  zmqConnected: boolean;
  minBtcThreshold: number;
  totalRawTxSeen: number;
  matchedCount: number;
  windowMinutes: number;
  events: WhaleTxEvent[];
}
