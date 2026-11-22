import { z } from 'zod';

export const SUPPORTED_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const;

export const SupportedSymbolSchema = z.enum(SUPPORTED_SYMBOLS);
export type SupportedSymbol = z.infer<typeof SupportedSymbolSchema>;

export const MicrostructureQuerySchema = z.object({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .default('BTC')
    .pipe(SupportedSymbolSchema),
});

export const PolymarketEdgeQuerySchema = z.object({
  asset: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() ? val.trim().toUpperCase() : undefined),
      SupportedSymbolSchema.optional()
    ),
});

export const OPTIONS_ASSETS = ['BTC', 'ETH'] as const;
export const OptionsAssetSchema = z.enum(OPTIONS_ASSETS);
export type OptionsAsset = z.infer<typeof OptionsAssetSchema>;

export const FundingArbQuerySchema = MicrostructureQuerySchema;

export const OptionsSkewQuerySchema = z.object({
  asset: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .default('BTC')
    .pipe(OptionsAssetSchema),
});

export type ExchangeVenue = 'binance' | 'bybit' | 'okx' | 'hyperliquid';

export interface VenueQuote {
  venue: ExchangeVenue;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  imbalance: number | null;
  fundingRateBps: number | null;
  ageMs: number;
  stale: boolean;
}

export interface MicrostructureSnapshot {
  symbol: SupportedSymbol;
  timestamp: string;
  computedInMs: number;
  midPriceUsd: number | null;
  crossExchangeSpreadBps: number | null;
  orderbookImbalance: number | null;
  cvd1mUsd: number;
  cvd5mUsd: number;
  volume1mUsd: number;
  avgFundingRateBps: number | null;
  liquidationCascadeScore: number;
  longLiq5mUsd: number;
  shortLiq5mUsd: number;
  maxAgeMs: number | null;
  sourcesActive: ExchangeVenue[];
  staleSources: ExchangeVenue[];
  outlierSources: ExchangeVenue[];
  venues: VenueQuote[];
}

export interface PolymarketEdgeItem {
  marketId: string;
  slug: string;
  question: string;
  asset: SupportedSymbol;
  yesTokenId: string;
  yesProbability: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spreadBps: number | null;
  volume24hUsd: number;
  endDate: string | null;
  spotReferenceUsd: number | null;
  spotOrderbookImbalance: number | null;
  ageMs: number | null;
}

export interface PolymarketEdgeSnapshot {
  timestamp: string;
  computedInMs: number;
  assetFilter: SupportedSymbol | null;
  wsConnected: boolean;
  lastGammaSyncAt: string | null;
  trackedMarketsCount: number;
  markets: PolymarketEdgeItem[];
}

export interface FundingVenueRate {
  venue: ExchangeVenue;
  mid: number | null;
  fundingRate8hBps: number;
  fundingAprPct: number;
  basisBps: number | null;
  ageMs: number;
}

export interface FundingArbSnapshot {
  symbol: SupportedSymbol;
  timestamp: string;
  computedInMs: number;
  spotMidUsd: number | null;
  perpMidUsd: number | null;
  spotPerpBasisBps: number | null;
  bestCarry: {
    longVenue: ExchangeVenue;
    shortVenue: ExchangeVenue;
    spreadBpsPer8h: number;
    annualizedAprPct: number;
  } | null;
  venues: FundingVenueRate[];
  sourcesActive: ExchangeVenue[];
}

export type VolatilityRegime = 'CALM' | 'ELEVATED' | 'PANIC' | 'UNKNOWN';

export interface OptionsSkewSnapshot {
  asset: OptionsAsset;
  timestamp: string;
  computedInMs: number;
  dvol: number | null;
  regime: VolatilityRegime;
  underlyingUsd: number | null;
  atmIv: number | null;
  otmPutIv: number | null;
  otmCallIv: number | null;
  putCallSkewIv: number | null;
  putCallOiRatio: number | null;
  totalOptionsOi: number;
  activeContracts: number;
  wsConnected: boolean;
  dvolAgeMs: number | null;
  lastChainSyncAt: string | null;
}
