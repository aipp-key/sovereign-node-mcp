import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createInternalCoreRouter } from '../src/interfaces/http/controllers/internal-core.controller.js';
import { createNodeTruthRouter } from '../src/interfaces/http/controllers/node-truth.controller.js';
import { NodeTruthService } from '../src/application/services/node-truth.service.js';
import { INodeTruthRepository } from '../src/application/interfaces/node-truth.interface.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';

function createStubRepo(): INodeTruthRepository {
  return {
    getMempoolEntropy: async () => ({
      txCount: 42_000,
      vsizeBytes: 12_000_000,
      totalFeeSats: 150_000_000,
      minFeeRateSatPerVb: 1.8,
      medianFeeRateSatPerVb: 3.1,
      fastFeeRateSatPerVb: 6.4,
      congestionLevel: 'MODERATE',
      updatedAt: 1_795_000_000,
    }),
    getSmartFeeEstimates: async () => ({
      fastestSatPerVb: 6.2,
      halfHourSatPerVb: 4.1,
      hourSatPerVb: 2.3,
      economicSatPerVb: 1.5,
      targetBlocksFastest: 2,
      targetBlocksEconomic: 6,
      updatedAt: 1_795_000_000,
    }),
    checkRbfShield: async (txid) => ({
      txid,
      isInMempool: true,
      bip125Replaceable: false,
      vsize: 140,
      feeRateSatPerVb: 5,
      hasConflicts: false,
      zeroConfRiskLevel: 'SAFE',
      recommendation: 'OK',
      updatedAt: 1_795_000_000,
    }),
    getLatestBlockHeader: async () => ({
      height: 976_500,
      hash: '0'.repeat(64),
      previousBlockHash: '1'.repeat(64),
      merkleRoot: '2'.repeat(64),
      timestamp: 1_795_000_000,
      bits: '17034219',
      nonce: 1,
      difficulty: 100_000_000_000,
      chain: 'main',
    }),
    getLightningTopology: async () => ({
      activeChannels: 32_000,
      totalCapacitySats: 379_000_000_000,
      gossipUpdatesPerMinute: 42,
      routingFeeMedianPpm: 120,
      updatedAt: 1_795_000_000,
    }),
    getLightningNetworkStats: async () => ({
      channel_count: 32_644,
      node_count: 16_237,
      total_capacity_sats: 379_380_315_130,
      avg_fee_rate_ppm: 0,
      med_fee_rate_ppm: 0,
      updatedAt: 1_795_000_000,
    }),
  };
}

function createStubL402Service(): L402Service {
  const gateway: ILightningGateway = {
    createL402Invoice: async (priceSats) => ({
      macaroon: 'stub-macaroon',
      invoice: 'lnbc10n1p0stub',
      paymentHash: 'a'.repeat(64),
      priceSats,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
    verifyMacaroon: () => ({ valid: true }),
    verifyPreimage: async (paymentHash, preimage) => ({
      isValid: true,
      paymentHash,
      preimage,
    }),
  };
  return new L402Service(gateway);
}

async function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe('Internal Bare-Metal Core Bridge (/internal/core/*)', () => {
  it('returns 503 when CORE_BRIDGE_KEY is not configured', async () => {
    const app = express();
    const svc = new NodeTruthService(createStubRepo());
    const prevKey = process.env.CORE_BRIDGE_KEY;
    delete process.env.CORE_BRIDGE_KEY;
    app.use(createInternalCoreRouter(svc, {}));
    const { baseUrl, close } = await startServer(app);
    try {
      const res = await fetch(`${baseUrl}/internal/core/btc-fees`);
      assert.equal(res.status, 503);
    } finally {
      if (prevKey !== undefined) process.env.CORE_BRIDGE_KEY = prevKey;
      await close();
    }
  });

  it('rejects missing or wrong keys with 401 and serves bare-metal Core schemas with valid key', async () => {
    const app = express();
    const svc = new NodeTruthService(createStubRepo());
    app.use(createInternalCoreRouter(svc, { coreBridgeKey: 'super-secret-core-key' }));
    const { baseUrl, close } = await startServer(app);
    try {
      const missing = await fetch(`${baseUrl}/internal/core/btc-fees`);
      assert.equal(missing.status, 401);

      const wrong = await fetch(`${baseUrl}/internal/core/btc-fees`, {
        headers: { 'x-sovroute-core-key': 'wrong-key' },
      });
      assert.equal(wrong.status, 401);

      const headers = { 'x-sovroute-core-key': 'super-secret-core-key' };

      const feesRes = await fetch(`${baseUrl}/internal/core/btc-fees`, { headers });
      assert.equal(feesRes.status, 200);
      const feesJson = (await feesRes.json()) as any;
      assert.equal(feesJson.status, 'success');
      assert.equal(feesJson.source, 'sovereign-bitcoind:31.1');
      assert.deepEqual(feesJson.data, {
        fastestFee: 7,
        halfHourFee: 5,
        hourFee: 3,
        minimumFee: 1,
      });

      const tipRes = await fetch(`${baseUrl}/internal/core/btc-tip`, { headers });
      assert.equal(tipRes.status, 200);
      const tipJson = (await tipRes.json()) as any;
      assert.equal(tipJson.source, 'sovereign-bitcoind:31.1');
      assert.deepEqual(tipJson.data, {
        height: 976_500,
        hash: '0'.repeat(64),
        synced: true,
      });

      const lnRes = await fetch(`${baseUrl}/internal/core/lightning-stats`, { headers });
      assert.equal(lnRes.status, 200);
      const lnJson = (await lnRes.json()) as any;
      assert.equal(lnJson.source, 'sovereign-lnd:0.21.3');
      assert.deepEqual(lnJson.data, {
        channel_count: 32_644,
        node_count: 16_237,
        total_capacity_sats: 379_380_315_130,
        avg_fee_rate_ppm: 0,
        med_fee_rate_ppm: 0,
      });
    } finally {
      await close();
    }
  });
});

describe('Optional Root HTML Redirect (REDIRECT_HTML_TO_URL)', () => {
  it('redirects Accept: text/html requests to sovroute.com while keeping JSON discovery', async () => {
    const app = express();
    const svc = new NodeTruthService(createStubRepo());
    app.use(createNodeTruthRouter(svc, createStubL402Service()));
    const { baseUrl, close } = await startServer(app);
    const prevRedirect = process.env.REDIRECT_HTML_TO_URL;
    process.env.REDIRECT_HTML_TO_URL = 'https://sovroute.com/';
    try {
      const htmlRes = await fetch(`${baseUrl}/`, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      });
      assert.equal(htmlRes.status, 302);
      assert.equal(htmlRes.headers.get('location'), 'https://sovroute.com/');

      const jsonRes = await fetch(`${baseUrl}/`, {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
      });
      assert.equal(jsonRes.status, 200);
      const jsonBody = (await jsonRes.json()) as any;
      assert.equal(jsonBody.service, 'Sovereign Node Engine');
    } finally {
      if (prevRedirect === undefined) delete process.env.REDIRECT_HTML_TO_URL;
      else process.env.REDIRECT_HTML_TO_URL = prevRedirect;
      await close();
    }
  });
});
