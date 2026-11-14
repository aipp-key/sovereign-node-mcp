import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac, createHash } from 'crypto';
import { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';
import { ILightningPayer } from '../src/application/interfaces/lightning-payer.interface.js';
import { INodeTruthRepository } from '../src/application/interfaces/node-truth.interface.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { NodeTruthService } from '../src/application/services/node-truth.service.js';
import { verifyL402Macaroon } from '../src/infrastructure/lightning/macaroon.helper.js';
import { PhoenixdGatewayAdapter } from '../src/infrastructure/lightning/phoenixd-gateway.adapter.js';
import { PhoenixdPayerAdapter } from '../src/infrastructure/lightning/phoenixd-payer.adapter.js';
import { NwcPayerAdapter } from '../src/infrastructure/alby/nwc-payer.adapter.js';
import { createOmniRailRouter } from '../src/interfaces/http/controllers/omni-rail.controller.js';
import {
  addBoundedSetEntry,
  setBoundedUnfulfilledPayment,
  unfulfilledPayments,
} from '../src/interfaces/http/middleware/retry-voucher.helper.js';

const SECRET = process.env.MACAROON_SECRET || 'sovereign-l402-dev-secret-key-32b-min';

function makeSignedL402(priceSats: number): string {
  const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const caveat = `payment_hash=${paymentHashHex}&expires_at=${expiresAt}&price_sats=${priceSats}`;
  const signature = createHmac('sha256', SECRET).update(caveat).digest('hex');
  const mac = Buffer.from(JSON.stringify({ caveat, paymentHash: paymentHashHex, signature })).toString('base64');
  return `L402 ${mac}:${preimageHex}`;
}

function makeGateway(): ILightningGateway {
  return {
    async createL402Invoice(priceSats: number) {
      const { paymentHashHex } = L402Service.generatePreimagePair();
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const caveat = `payment_hash=${paymentHashHex}&expires_at=${expiresAt}&price_sats=${priceSats}`;
      const signature = createHmac('sha256', SECRET).update(caveat).digest('hex');
      const macaroon = Buffer.from(JSON.stringify({ caveat, paymentHash: paymentHashHex, signature })).toString('base64');
      return { macaroon, invoice: `lnbc${priceSats * 10}n1ptest`, paymentHash: paymentHashHex, priceSats, expiresAt };
    },
    verifyMacaroon: (mac, price) => verifyL402Macaroon(mac, SECRET, price),
    async verifyPreimage(paymentHash: string, preimage: string) {
      const ok = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex').toLowerCase() === paymentHash.toLowerCase();
      return ok ? { isValid: true, paymentHash, preimage } : { isValid: false, paymentHash, preimage, errorReason: 'Mismatch' };
    },
    async isInvoiceSettled() { return true; },
  };
}

function makeDummyRepo(): INodeTruthRepository {
  const ts = () => Math.floor(Date.now() / 1000);
  return {
    getMempoolEntropy: async () => ({ txCount: 1, vsizeBytes: 100, totalFeeSats: 100, minFeeRateSatPerVb: 1, medianFeeRateSatPerVb: 1, fastFeeRateSatPerVb: 1, congestionLevel: 'LOW', updatedAt: ts() }),
    getSmartFeeEstimates: async () => ({ fastestSatPerVb: 1, halfHourSatPerVb: 1, hourSatPerVb: 1, economicSatPerVb: 1, targetBlocksFastest: 2, targetBlocksEconomic: 6, updatedAt: ts() }),
    checkRbfShield: async (txid) => ({ txid, isInMempool: false, confirmations: 1, bip125Replaceable: false, vsize: 140, feeRateSatPerVb: 1, ancestorCount: 1, hasConflicts: false, zeroConfRiskLevel: 'SAFE', recommendation: 'Safe', updatedAt: ts() }),
    getLatestBlockHeader: async () => ({ height: 975900, hash: '0'.repeat(64), previousBlockHash: '0'.repeat(64), merkleRoot: '0'.repeat(64), timestamp: ts(), bits: '1701f2b4', nonce: 0, difficulty: 1, chain: 'main' }),
    getLightningTopology: async () => ({ activeChannels: 1, totalCapacitySats: 1000, gossipUpdatesPerMinute: 1, routingFeeMedianPpm: 1, updatedAt: ts() }),
  };
}

test('FINAL-EDGE 1: /v1/omni/pay-lightning & /v1/omni/* L402 Single-Use Anti-Replay & 500 Idempotent Recovery', async () => {
  let failOnSecondPair = false;
  const paidInvoices: string[] = [];
  const payer: ILightningPayer = {
    async payInvoice(inv: string) {
      if (failOnSecondPair) { failOnSecondPair = false; throw new Error('phoenixd down'); }
      paidInvoices.push(inv);
      return { paymentHash: 'aa'.repeat(32), preimage: 'bb'.repeat(32), feeSat: 1 };
    },
  };

  const app = express();
  app.use(express.json());
  app.use(createOmniRailRouter(new NodeTruthService(makeDummyRepo()), new L402Service(makeGateway()), payer));
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const callBridge = (auth: string) =>
    fetch(`${baseUrl}/v1/omni/pay-lightning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ invoice: 'lnbc50n1p4w7c87pp5hxkrcp' }),
    });

  try {
    // 1. First L402 payment settles; exact replay MUST be rejected with 402
    const l402First = makeSignedL402(25);
    const ok1 = await callBridge(l402First);
    assert.equal(ok1.status, 200);
    assert.equal(((await ok1.json()) as any).status, 'SETTLED');
    assert.equal(paidInvoices.length, 1);

    const replay1 = await callBridge(l402First);
    assert.equal(replay1.status, 402);
    assert.match(((await replay1.json()) as any).error, /L402 Replay Rejected/);
    assert.equal(paidInvoices.length, 1, 'Wallet must never pay a second time on L402 replay');

    // 2. When 500 occurs after valid L402 auth, same L402 header recovers once, then locks
    failOnSecondPair = true;
    const l402Recoverable = makeSignedL402(25);
    const errRes = await callBridge(l402Recoverable);
    assert.equal(errRes.status, 500);
    assert.ok(errRes.headers.get('x-payment-retry-voucher'));

    const recoveredRes = await callBridge(l402Recoverable);
    assert.equal(recoveredRes.status, 200);
    assert.equal(paidInvoices.length, 2);

    const postRecoveryReplay = await callBridge(l402Recoverable);
    assert.equal(postRecoveryReplay.status, 402);
    assert.equal(paidInvoices.length, 2);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('FINAL-EDGE 2: Memory Exhaustion Protection — Bounded Set FIFO Eviction & Expired Unfulfilled-Payment Pruning', () => {
  const s = new Set<string>();
  for (const k of ['k1', 'k2', 'k3', 'k4', 'k5']) addBoundedSetEntry(s, k, 5);
  assert.equal(s.size, 5);
  // Refresh k1 -> k2 becomes oldest
  addBoundedSetEntry(s, 'k1', 5);
  addBoundedSetEntry(s, 'k6', 5);
  assert.equal(s.size, 5);
  assert.equal(s.has('k2'), false, 'Oldest entry k2 must be evicted');
  assert.equal(s.has('k1') && s.has('k6'), true);

  const snapshot = new Map(unfulfilledPayments);
  unfulfilledPayments.clear();
  try {
    const now = Math.floor(Date.now() / 1000);
    setBoundedUnfulfilledPayment('expired-1', { priceSats: 5, expiresAt: now - 60 }, 3);
    setBoundedUnfulfilledPayment('live-1', { priceSats: 5, expiresAt: now + 3600 }, 3);
    setBoundedUnfulfilledPayment('live-2', { priceSats: 5, expiresAt: now + 3600 }, 3);
    // At capacity (3): adding live-3 must prune expired-1 first rather than evicting live-1
    setBoundedUnfulfilledPayment('live-3', { priceSats: 5, expiresAt: now + 3600 }, 3);
    assert.equal(unfulfilledPayments.has('expired-1'), false, 'Expired entry must be pruned first');
    assert.equal(unfulfilledPayments.has('live-1') && unfulfilledPayments.has('live-2') && unfulfilledPayments.has('live-3'), true);
    // Exceeding capacity with all live entries evicts oldest live entry (live-1)
    setBoundedUnfulfilledPayment('live-4', { priceSats: 5, expiresAt: now + 3600 }, 3);
    assert.equal(unfulfilledPayments.size, 3);
    assert.equal(unfulfilledPayments.has('live-1'), false);
    assert.equal(unfulfilledPayments.has('live-4'), true);
  } finally {
    unfulfilledPayments.clear();
    for (const [k, v] of snapshot.entries()) unfulfilledPayments.set(k, v);
  }
});

test('FINAL-EDGE 3: PhoenixdGatewayAdapter, PhoenixdPayerAdapter & NwcPayerAdapter Unit & Error-Path Suite', async () => {
  const realFetch = globalThis.fetch;
  const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
  let mode: 'ok' | 'unpaid' | 'http500' | 'throw' = 'ok';
  let capturedAuth = '';
  let capturedUrl = '';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    capturedAuth = String((init?.headers as Record<string, string>)?.Authorization || '');
    if (mode === 'throw') throw new Error('ECONNREFUSED');
    if (mode === 'http500') return new Response('phoenixd error', { status: 500 });
    if (capturedUrl.endsWith('/createinvoice')) {
      return new Response(JSON.stringify({ paymentHash: paymentHashHex, serialized: 'lnbc50n1phoenixmock' }), { status: 200 });
    }
    if (capturedUrl.includes('/payments/incoming/')) {
      return new Response(JSON.stringify({ isPaid: mode === 'ok' }), { status: 200 });
    }
    if (capturedUrl.endsWith('/payinvoice')) {
      return new Response(JSON.stringify({ paymentHash: paymentHashHex, paymentPreimage: preimageHex, routingFeeSat: 2 }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const gateway = new PhoenixdGatewayAdapter({
      baseUrl: 'http://phoenix.local:9740',
      httpPassword: 'secret-pass',
      macaroonSecretKey: SECRET,
    });
    const expectedBasic = `Basic ${Buffer.from(':secret-pass').toString('base64')}`;

    const challenge = await gateway.createL402Invoice(5, 'edge-memo');
    assert.equal(capturedUrl, 'http://phoenix.local:9740/createinvoice');
    assert.equal(capturedAuth, expectedBasic);
    assert.equal(challenge.paymentHash, paymentHashHex);
    assert.equal(gateway.verifyMacaroon(challenge.macaroon, 5).valid, true);

    assert.equal((await gateway.verifyPreimage(paymentHashHex, preimageHex)).isValid, true);
    assert.equal((await gateway.verifyPreimage(paymentHashHex, '00'.repeat(32))).isValid, false);
    mode = 'unpaid';
    assert.equal((await gateway.verifyPreimage(paymentHashHex, preimageHex)).isValid, false);
    mode = 'throw';
    assert.equal((await gateway.verifyPreimage(paymentHashHex, preimageHex)).isValid, false);
    mode = 'http500';
    await assert.rejects(() => gateway.createL402Invoice(5, 'fail'), /Phoenixd invoice creation failed/);

    const payer = new PhoenixdPayerAdapter({ baseUrl: 'http://phoenix.local:9740', httpPassword: 'secret-pass' });
    mode = 'ok';
    const paid = await payer.payInvoice('lnbc50n1p...');
    assert.equal(capturedUrl, 'http://phoenix.local:9740/payinvoice');
    assert.equal(capturedAuth, expectedBasic);
    assert.equal(paid.preimage, preimageHex);
    assert.equal(paid.feeSat, 2);

    mode = 'http500';
    await assert.rejects(() => payer.payInvoice('lnbc50n1p...'), /Autonomous payment failed on Lightning Network/);

    assert.throws(() => new NwcPayerAdapter({ nostrWalletConnectUrl: 'https://invalid.example.com' }), /Invalid Nostr Wallet Connect URL/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
