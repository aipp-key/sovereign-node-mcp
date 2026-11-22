import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  MicrostructureQuerySchema,
  OptionsSkewQuerySchema,
  PolymarketEdgeQuerySchema,
} from '../src/domain/schemas/market-intel.schema.js';
import {
  RollingLiquidationWindow,
  RollingTradeWindow,
  computeCrossExchangeSpreadBps,
  computeOrderbookImbalance,
  computeRobustMidPrice,
} from '../src/infrastructure/market/ring-metrics.helper.js';
import { computeFundingArbSnapshot } from '../src/infrastructure/market/spot-price.ingestor.js';
import { summarizeDeribitChain } from '../src/infrastructure/market/deribit-options.ingestor.js';
import { MarketIntelService } from '../src/application/services/market-intel.service.js';
import { createMarketIntelRouter } from '../src/interfaces/http/controllers/market-intel.controller.js';
import type { L402Service } from '../src/application/services/l402.service.js';

describe('Market Intel Schemas & Ring Metrics', () => {
  it('validates and normalizes MicrostructureQuerySchema and PolymarketEdgeQuerySchema', () => {
    assert.deepEqual(MicrostructureQuerySchema.parse({}), { symbol: 'BTC' });
    assert.deepEqual(MicrostructureQuerySchema.parse({ symbol: ' eth ' }), { symbol: 'ETH' });
    assert.equal(MicrostructureQuerySchema.safeParse({ symbol: 'DOGE' }).success, false);

    assert.equal(PolymarketEdgeQuerySchema.parse({}).asset, undefined);
    assert.deepEqual(PolymarketEdgeQuerySchema.parse({ asset: 'sol' }), { asset: 'SOL' });
    assert.equal(PolymarketEdgeQuerySchema.safeParse({ asset: 'XRP' }).success, false);
  });

  it('tracks 1m/5m rolling CVD and prunes expired trades without float drift', () => {
    const win = new RollingTradeWindow();
    const now = 1_000_000;
    win.record(100_000, 0.1, true, now - 400_000);
    win.record(100_000, 0.05, true, now - 120_000);
    win.record(100_000, 0.03, false, now - 10_000);

    const s = win.summary(now);
    assert.equal(s.cvd1mUsd, -3000);
    assert.equal(s.cvd5mUsd, 2000);
    assert.equal(s.volume1mUsd, 3000);
  });

  it('scores rolling 5m liquidations into long/short USD and cascadeScore 0-100', () => {
    const liq = new RollingLiquidationWindow();
    const now = 2_000_000;
    assert.equal(liq.summary(now).cascadeScore, 0);

    liq.record(100_000, 1, 'long', now - 20_000);
    liq.record(100_000, 0.25, 'short', now - 10_000);
    const s = liq.summary(now);
    assert.equal(s.longLiq5mUsd, 100000);
    assert.equal(s.shortLiq5mUsd, 25000);
    assert.equal(s.totalLiq5mUsd, 125000);
    assert.ok(s.cascadeScore > 50 && s.cascadeScore <= 100);
  });

  it('computes orderbook imbalance and cross-exchange spread in bps', () => {
    const imb = computeOrderbookImbalance(
      [[100, 3], [99, 1]],
      [[101, 1]],
    );
    assert.equal(imb, 0.596);

    const spreadBps = computeCrossExchangeSpreadBps([
      { venue: 'binance', bestBid: 99995, bestAsk: 100005, mid: 100000, imbalance: 0.1, fundingRateBps: 1, ageMs: 10, stale: false },
      { venue: 'bybit', bestBid: 100045, bestAsk: 100055, mid: 100050, imbalance: 0.2, fundingRateBps: 1, ageMs: 15, stale: false },
      { venue: 'okx', bestBid: 90000, bestAsk: 90010, mid: 90005, imbalance: 0, fundingRateBps: 0, ageMs: 60000, stale: true },
    ]);
    assert.equal(spreadBps, 5);
  });

  it('filters poisoned outlier venue ticks via median deviation guard', () => {
    const res = computeRobustMidPrice([
      { venue: 'binance', bestBid: 99995, bestAsk: 100005, mid: 100000, imbalance: 0.1, fundingRateBps: 1, ageMs: 5, stale: false },
      { venue: 'bybit', bestBid: 100005, bestAsk: 100015, mid: 100010, imbalance: 0.1, fundingRateBps: 1, ageMs: 5, stale: false },
      { venue: 'okx', bestBid: 100015, bestAsk: 100025, mid: 100020, imbalance: 0.1, fundingRateBps: 1, ageMs: 5, stale: false },
      { venue: 'hyperliquid', bestBid: 114995, bestAsk: 115005, mid: 115000, imbalance: 0.9, fundingRateBps: 1, ageMs: 5, stale: false },
    ]);
    assert.deepEqual(res.outlierSources, ['hyperliquid']);
    assert.equal(res.cleanQuotes.length, 3);
    assert.equal(res.midPriceUsd, 100010);
  });

  it('returns 503 with Retry-After before payment challenge when feeds are cold', async () => {
    const service = new MarketIntelService();
    const fakeL402 = {
      issueChallenge: async () => {
        throw new Error('should not issue 402 challenge when feed is cold');
      },
    } as unknown as L402Service;

    const app = express();
    app.use(createMarketIntelRouter(service, fakeL402));

    const server = await new Promise<http.Server>((resolve) => {
      const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    });
    try {
      const addr = server.address() as { port: number };
      const r1 = await fetch(`http://127.0.0.1:${addr.port}/v1/intel/microstructure?symbol=BTC`);
      assert.equal(r1.status, 503);
      assert.equal(r1.headers.get('retry-after'), '3');

      const r2 = await fetch(`http://127.0.0.1:${addr.port}/v1/intel/polymarket-edge`);
      assert.equal(r2.status, 503);
      assert.equal(r2.headers.get('retry-after'), '5');

      const r3 = await fetch(`http://127.0.0.1:${addr.port}/v1/intel/funding-arb?symbol=BTC`);
      assert.equal(r3.status, 503);
      assert.equal(r3.headers.get('retry-after'), '5');

      const r4 = await fetch(`http://127.0.0.1:${addr.port}/v1/intel/options-skew?asset=BTC`);
      assert.equal(r4.status, 503);
      assert.equal(r4.headers.get('retry-after'), '5');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('computes cross-exchange funding carry APR, spot-perp basis and Deribit chain skew', () => {
    assert.deepEqual(OptionsSkewQuerySchema.parse({}), { asset: 'BTC' });
    assert.equal(OptionsSkewQuerySchema.safeParse({ asset: 'SOL' }).success, false);

    const arb = computeFundingArbSnapshot('BTC', 100_000, {
      symbol: 'BTC',
      timestamp: '2026-11-22T00:00:00.000Z',
      computedInMs: 0.1,
      midPriceUsd: 100_050,
      crossExchangeSpreadBps: 1,
      orderbookImbalance: 0,
      cvd1mUsd: 0,
      cvd5mUsd: 0,
      volume1mUsd: 0,
      avgFundingRateBps: 1,
      liquidationCascadeScore: 0,
      longLiq5mUsd: 0,
      shortLiq5mUsd: 0,
      maxAgeMs: 10,
      sourcesActive: ['binance', 'bybit'],
      staleSources: [],
      outlierSources: [],
      venues: [
        { venue: 'binance', bestBid: 100040, bestAsk: 100060, mid: 100050, imbalance: 0, fundingRateBps: 3, ageMs: 10, stale: false },
        { venue: 'bybit', bestBid: 100040, bestAsk: 100060, mid: 100050, imbalance: 0, fundingRateBps: 1, ageMs: 10, stale: false },
      ],
    });
    assert.equal(arb.spotPerpBasisBps, 5);
    assert.deepEqual(arb.bestCarry, {
      longVenue: 'bybit',
      shortVenue: 'binance',
      spreadBpsPer8h: 2,
      annualizedAprPct: 21.9,
    });

    const chain = summarizeDeribitChain([
      { instrument_name: 'BTC-26MAR27-100000-C', open_interest: 100, mark_iv: 50, underlying_price: 100_000 },
      { instrument_name: 'BTC-26MAR27-90000-P', open_interest: 150, mark_iv: 58, underlying_price: 100_000 },
      { instrument_name: 'BTC-26MAR27-110000-C', open_interest: 50, mark_iv: 46, underlying_price: 100_000 },
    ]);
    assert.equal(chain.atmIv, 50);
    assert.equal(chain.otmPutIv, 58);
    assert.equal(chain.otmCallIv, 46);
    assert.equal(chain.putCallSkewIv, 12);
    assert.equal(chain.putCallOiRatio, 1);
  });
});
