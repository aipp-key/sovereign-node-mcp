import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac } from 'crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { LndGatewayAdapter } from '../src/infrastructure/lightning/lnd-gateway.adapter.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { NodeTruthService } from '../src/application/services/node-truth.service.js';
import { INodeTruthRepository } from '../src/application/interfaces/node-truth.interface.js';
import { createNodeTruthRouter } from '../src/interfaces/http/controllers/node-truth.controller.js';
import { createOmniRailRouter } from '../src/interfaces/http/controllers/omni-rail.controller.js';
import { BASE_PAY_TO_ADDRESS, BASE_USDC_CONTRACT } from '../src/interfaces/http/middleware/l402.middleware.js';
import { SOLANA_PAY_TO_ADDRESS, SOLANA_USDC_MINT } from '../src/interfaces/http/middleware/omni-rail.middleware.js';

const SEC_SECRET = process.env.MACAROON_SECRET || 'sovereign-l402-dev-secret-key-32b-min';

function createMockRepo(): INodeTruthRepository {
  const ts = () => Math.floor(Date.now() / 1000);
  return {
    getMempoolEntropy: async () => ({
      txCount: 42000, vsizeBytes: 18_000_000, totalFeeSats: 2_500_000,
      minFeeRateSatPerVb: 1.0, medianFeeRateSatPerVb: 1.5, fastFeeRateSatPerVb: 3.0,
      congestionLevel: 'HIGH', updatedAt: ts(),
    }),
    getSmartFeeEstimates: async () => ({
      fastestSatPerVb: 3.0, halfHourSatPerVb: 2.0, hourSatPerVb: 1.5, economicSatPerVb: 1.0,
      targetBlocksFastest: 2, targetBlocksEconomic: 6, updatedAt: ts(),
    }),
    checkRbfShield: async (txid: string) => ({
      txid, isInMempool: true, confirmations: 0, bip125Replaceable: false,
      vsize: 140, feeRateSatPerVb: 5.0, ancestorCount: 1, hasConflicts: false,
      zeroConfRiskLevel: 'SAFE', recommendation: 'Safe', updatedAt: ts(),
    }),
    getLatestBlockHeader: async () => ({
      height: 975830, hash: '0'.repeat(64), previousBlockHash: '0'.repeat(64), merkleRoot: '0'.repeat(64),
      timestamp: ts(), bits: '1701f2b4', nonce: 0, difficulty: 1e14, chain: 'main',
    }),
    getLightningTopology: async () => ({
      activeChannels: 0, totalCapacitySats: 0, gossipUpdatesPerMinute: 40,
      routingFeeMedianPpm: 250, updatedAt: ts(),
    }),
    getNextBlockXray: async () => ({
      candidateBlockHeight: 975831, previousBlockHash: '0'.repeat(64), totalTransactions: 100,
      totalWeight: 3_900_000, blockFillPercentage: 97.5, totalFeeSats: 500_000,
      coinbaseRewardSats: 312_500_000, cutoffFeeRateSatPerVb: 1.0, medianFeeRateSatPerVb: 2.0,
      topFeeRateSatPerVb: 20.0, topWhaleTransactions: [], updatedAt: ts(),
    }),
  };
}

async function startSecServer() {
  const lnd = new LndGatewayAdapter({
    tailscaleHost: '127.0.0.1', containerName: 'sovereign-lnd',
    macaroonSecretKey: SEC_SECRET, devBypassSettlement: true,
  });
  const l402Service = new L402Service(lnd);
  const nodeTruthService = new NodeTruthService(createMockRepo());
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createNodeTruthRouter(nodeTruthService, l402Service));
  app.use(createOmniRailRouter(nodeTruthService, l402Service));
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`, nodeTruthService,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

function signMacaroon(paymentHash: string, priceSats: number, expiresAt: number): string {
  const caveat = `payment_hash=${paymentHash}&expires_at=${expiresAt}&price_sats=${priceSats}`;
  const signature = createHmac('sha256', SEC_SECRET).update(caveat).digest('hex');
  return Buffer.from(JSON.stringify({ caveat, paymentHash, signature })).toString('base64');
}

function signVoucher(voucherId: string, priceSats: number, expiresAt: number, overrideId?: string): string {
  const caveat = `voucher_id=${voucherId}&price_sats=${priceSats}&rail=X402-BASE-USDC&expires_at=${expiresAt}`;
  const signature = createHmac('sha256', SEC_SECRET).update(caveat).digest('hex');
  return Buffer.from(JSON.stringify({ caveat, voucherId: overrideId ?? voucherId, signature })).toString('base64');
}

async function signX402(opts: {
  account: ReturnType<typeof privateKeyToAccount>;
  nonce: `0x${string}`; value: bigint; validAfter?: bigint; validBefore?: bigint;
  overrideSig?: string;
}): Promise<string> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = opts.validAfter ?? 0n;
  const validBefore = opts.validBefore ?? now + 3600n;
  const signature = opts.overrideSig ?? await opts.account.signTypedData({
    domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: BASE_USDC_CONTRACT as `0x${string}` },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: { from: opts.account.address, to: BASE_PAY_TO_ADDRESS as `0x${string}`, value: opts.value, validAfter, validBefore, nonce: opts.nonce },
  });
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    payload: {
      authorization: {
        from: opts.account.address, to: BASE_PAY_TO_ADDRESS, value: opts.value.toString(),
        validAfter: validAfter.toString(), validBefore: validBefore.toString(), nonce: opts.nonce,
      },
      signature,
    },
  })).toString('base64');
}

function mockBaseAndSettleFetch(originalFetch: typeof fetch, onSettle: () => Promise<number> | number): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('mainnet.base.org')) {
      let parsed: any = {};
      try { parsed = JSON.parse(typeof init?.body === 'string' ? init.body : '{}'); } catch { /* ignore */ }
      const id = Array.isArray(parsed) ? (parsed[0]?.id ?? 1) : (parsed?.id ?? 1);
      const res = { jsonrpc: '2.0', id, result: `0x${(1_000_000n).toString(16).padStart(64, '0')}` };
      return new Response(JSON.stringify(Array.isArray(parsed) ? [res] : res), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/settle')) {
      const count = await onSettle();
      return new Response(JSON.stringify({ success: true, transaction: `0xtx${count.toString().padStart(62, '0')}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

test('SEC-ATTACK 1: L402 Split-Hash Privilege Escalation Attack is rejected with 402', async () => {
  const { baseUrl, close } = await startSecServer();
  try {
    const paid1 = L402Service.generatePreimagePair();
    const unpaid5 = L402Service.generatePreimagePair();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const valid5 = JSON.parse(Buffer.from(signMacaroon(unpaid5.paymentHashHex, 5, exp), 'base64').toString('utf8'));
    valid5.paymentHash = paid1.paymentHashHex; // Graft paid 1-sat hash onto signed 5-sat caveat
    const splitMac = Buffer.from(JSON.stringify(valid5)).toString('base64');

    for (const ep of [`/v1/chain/btc/rbf-shield/${'a'.repeat(64)}`, `/v1/omni/btc/rbf-shield/${'a'.repeat(64)}`]) {
      const res = await fetch(`${baseUrl}${ep}`, { headers: { Authorization: `L402 ${splitMac}:${paid1.preimageHex}` } });
      assert.strictEqual(res.status, 402, `Split-hash escalation must be blocked on ${ep}`);
    }
  } finally { await close(); }
});

test('SEC-ATTACK 2: Base64 null/array/primitive payloads & non-numeric BigInt DoS attacks return 402 (never 500)', async () => {
  const { baseUrl, close } = await startSecServer();
  try {
    const evilPayloads = [
      'null', '[]', '12345', '"string"',
      JSON.stringify({ x402Version: 2, payload: { authorization: { from: '0x1111111111111111111111111111111111111111', to: BASE_PAY_TO_ADDRESS, value: 'NaN' }, signature: '0x123' } }),
      JSON.stringify({ x402Version: 2, payload: { authorization: { from: '0x1111111111111111111111111111111111111111', to: BASE_PAY_TO_ADDRESS, value: '-5000' }, signature: '0x123' } }),
      JSON.stringify({ network: 'eip155:42161', authorization: { to: BASE_PAY_TO_ADDRESS, value: '1.5e10' }, signature: '0xabc' }),
      JSON.stringify({ network: 'solana:mainnet', to: SOLANA_PAY_TO_ADDRESS, asset: SOLANA_USDC_MINT, amount: 'not_int', signature: 'SigX' }),
    ];
    for (const raw of evilPayloads) {
      const b64 = Buffer.from(raw).toString('base64');
      for (const [ep, hdr] of [
        ['/v1/chain/btc/mempool', 'Payment-Signature'], ['/v1/chain/btc/mempool', 'X-Payment-Retry-Voucher'],
        ['/v1/omni/btc/mempool', 'X-EVM-Payment'], ['/v1/omni/btc/mempool', 'X-Solana-Payment'],
      ] as const) {
        const res = await fetch(`${baseUrl}${ep}`, { headers: { [hdr]: b64 } });
        assert.strictEqual(res.status, 402, `${hdr} with ${raw.slice(0, 24)} must return 402 (got ${res.status})`);
      }
    }
  } finally { await close(); }
});

test('SEC-ATTACK 3: Query & path parameter pollution blocked at 400 before payment', async () => {
  const { baseUrl, close } = await startSecServer();
  try {
    const pollutedPaths = [
      '/v1/chain/btc/next-block-xray?txid[toString]=1',
      '/v1/chain/btc/next-block-xray?txid[]=abc',
      '/v1/chain/btc/next-block-xray?txid=__proto__',
      '/v1/chain/btc/next-block-xray?txid=$(id)',
      '/v1/omni/btc/next-block-xray?txid[foo]=bar',
      '/v1/chain/btc/rbf-shield/nothex;ls',
      '/v1/omni/btc/rbf-shield/short',
    ];
    for (const path of pollutedPaths) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.strictEqual(res.status, 400, `${path} must return 400 before payment`);
    }
  } finally { await close(); }
});

test('SEC-ATTACK 4: 50x Parallel EIP-3009 Base USDC Nonce Race yields strictly 1x 200 OK, 49x 402, 1x /settle', async () => {
  const { baseUrl, close } = await startSecServer();
  const originalFetch = globalThis.fetch;
  let settleCount = 0;
  globalThis.fetch = mockBaseAndSettleFetch(originalFetch, async () => {
    await new Promise((r) => setTimeout(r, 15));
    return ++settleCount;
  });
  try {
    const header = await signX402({ account: privateKeyToAccount(generatePrivateKey()), nonce: `0x${'e1'.repeat(32)}`, value: 2000n });
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': header } }))
    );
    const statuses = responses.map((r) => r.status);
    assert.strictEqual(statuses.filter((s) => s === 200).length, 1);
    assert.strictEqual(statuses.filter((s) => s === 402).length, 49);
    assert.strictEqual(statuses.filter((s) => s >= 500).length, 0);
    assert.strictEqual(settleCount, 1);
  } finally { globalThis.fetch = originalFetch; await close(); }
});

test('SEC-ATTACK 5: 50x Parallel Hybrid Recovery Race (25x Voucher + 25x Same Header) yields 1x 200 OK & 49x 402', async () => {
  const { baseUrl, nodeTruthService, close } = await startSecServer();
  const originalFetch = globalThis.fetch;
  const origGetMempool = nodeTruthService.getMempoolEntropy.bind(nodeTruthService);
  let settleCount = 0;
  globalThis.fetch = mockBaseAndSettleFetch(originalFetch, () => ++settleCount);
  try {
    const header = await signX402({ account: privateKeyToAccount(generatePrivateKey()), nonce: `0x${'e2'.repeat(32)}`, value: 2000n });
    nodeTruthService.getMempoolEntropy = async () => { throw new Error('RPC outage'); };
    const failRes = await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': header } });
    assert.strictEqual(failRes.status, 500);
    const voucher = failRes.headers.get('x-payment-retry-voucher')!;
    assert.ok(voucher);

    nodeTruthService.getMempoolEntropy = async () => {
      await new Promise((r) => setTimeout(r, 15));
      return origGetMempool();
    };
    const races = await Promise.all([
      ...Array.from({ length: 25 }, () => fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'X-Payment-Retry-Voucher': voucher } })),
      ...Array.from({ length: 25 }, () => fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': header } })),
    ]);
    const statuses = races.map((r) => r.status);
    assert.strictEqual(statuses.filter((s) => s === 200).length, 1);
    assert.strictEqual(statuses.filter((s) => s === 402).length, 49);
    assert.strictEqual(statuses.filter((s) => s >= 500).length, 0);
    assert.strictEqual(settleCount, 1);
  } finally { globalThis.fetch = originalFetch; nodeTruthService.getMempoolEntropy = origGetMempool; await close(); }
});

test('SEC-ATTACK 6: Cascading 500 Failures (500 -> Voucher 500 -> Recovery 200 -> Replays 402)', async () => {
  const { baseUrl, nodeTruthService, close } = await startSecServer();
  const originalFetch = globalThis.fetch;
  const origGetMempool = nodeTruthService.getMempoolEntropy.bind(nodeTruthService);
  let settleCount = 0;
  globalThis.fetch = mockBaseAndSettleFetch(originalFetch, () => ++settleCount);
  try {
    const header = await signX402({ account: privateKeyToAccount(generatePrivateKey()), nonce: `0x${'e3'.repeat(32)}`, value: 2000n });
    nodeTruthService.getMempoolEntropy = async () => { throw new Error('Outage #1'); };
    const r1 = await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': header } });
    assert.strictEqual(r1.status, 500);
    const voucherA = r1.headers.get('x-payment-retry-voucher')!;

    nodeTruthService.getMempoolEntropy = async () => { throw new Error('Outage #2'); };
    const r2 = await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'X-Payment-Retry-Voucher': voucherA } });
    assert.strictEqual(r2.status, 500);
    const voucherB = r2.headers.get('x-payment-retry-voucher')!;
    assert.ok(voucherB);

    nodeTruthService.getMempoolEntropy = origGetMempool;
    const r3 = await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'X-Payment-Retry-Voucher': voucherB } });
    assert.strictEqual(r3.status, 200);

    for (const h of [{ 'X-Payment-Retry-Voucher': voucherA }, { 'X-Payment-Retry-Voucher': voucherB }, { 'Payment-Signature': header }]) {
      const replay = await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: h as Record<string, string> });
      assert.strictEqual(replay.status, 402);
    }
    assert.strictEqual(settleCount, 1);
  } finally { globalThis.fetch = originalFetch; nodeTruthService.getMempoolEntropy = origGetMempool; await close(); }
});

test('SEC-ATTACK 7: Unauthenticated Recovery Spoofing & Omni-Rail Tampering rejected with 402', async () => {
  const { baseUrl, nodeTruthService, close } = await startSecServer();
  const originalFetch = globalThis.fetch;
  const origGetMempool = nodeTruthService.getMempoolEntropy.bind(nodeTruthService);
  let settleCount = 0;
  globalThis.fetch = mockBaseAndSettleFetch(originalFetch, () => ++settleCount);
  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = `0x${'e4'.repeat(32)}` as `0x${string}`;
    const validHeader = await signX402({ account, nonce, value: 2000n });
    nodeTruthService.getMempoolEntropy = async () => { throw new Error('Outage'); };
    assert.strictEqual((await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': validHeader } })).status, 500);

    nodeTruthService.getMempoolEntropy = origGetMempool;
    const spoofedHeader = await signX402({ account, nonce, value: 2000n, overrideSig: `0x${'ff'.repeat(65)}` });
    assert.strictEqual((await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': spoofedHeader } })).status, 402);

    const arbSig = `0x${'c9'.repeat(32)}`;
    const arbPaid = Buffer.from(JSON.stringify({ network: 'eip155:42161', authorization: { to: BASE_PAY_TO_ADDRESS, value: '2000' }, signature: arbSig })).toString('base64');
    nodeTruthService.getMempoolEntropy = async () => { throw new Error('Omni outage'); };
    assert.strictEqual((await fetch(`${baseUrl}/v1/omni/btc/mempool`, { headers: { 'X-EVM-Payment': arbPaid } })).status, 500);

    nodeTruthService.getMempoolEntropy = origGetMempool;
    const wrongTo = Buffer.from(JSON.stringify({ network: 'eip155:42161', authorization: { to: '0x000000000000000000000000000000000000dEaD', value: '2000' }, signature: arbSig })).toString('base64');
    const underPaid = Buffer.from(JSON.stringify({ network: 'eip155:42161', authorization: { to: BASE_PAY_TO_ADDRESS, value: '1' }, signature: arbSig })).toString('base64');
    assert.strictEqual((await fetch(`${baseUrl}/v1/omni/btc/mempool`, { headers: { 'X-EVM-Payment': wrongTo } })).status, 402);
    assert.strictEqual((await fetch(`${baseUrl}/v1/omni/btc/mempool`, { headers: { 'X-EVM-Payment': underPaid } })).status, 402);
    assert.strictEqual((await fetch(`${baseUrl}/v1/omni/btc/rbf-shield/${'a'.repeat(64)}`, { headers: { 'X-EVM-Payment': arbPaid } })).status, 402);
    assert.strictEqual((await fetch(`${baseUrl}/v1/omni/btc/mempool`, { headers: { 'X-EVM-Payment': arbPaid } })).status, 200);
  } finally { globalThis.fetch = originalFetch; nodeTruthService.getMempoolEntropy = origGetMempool; await close(); }
});

test('SEC-ATTACK 8: Expired EIP-3009 Authorizations & Expired/Split-ID Retry Vouchers rejected with 402', async () => {
  const { baseUrl, close } = await startSecServer();
  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const now = BigInt(Math.floor(Date.now() / 1000));
    const expiredBefore = await signX402({ account, nonce: `0x${'f1'.repeat(32)}`, value: 2000n, validBefore: now - 10n });
    const futureAfter = await signX402({ account, nonce: `0x${'f2'.repeat(32)}`, value: 2000n, validAfter: now + 600n });
    assert.strictEqual((await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': expiredBefore } })).status, 402);
    assert.strictEqual((await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'Payment-Signature': futureAfter } })).status, 402);

    const expiredVoucher = signVoucher('aabbccdd11223344aabbccdd11223344', 5, Number(now) - 10);
    const splitIdVoucher = signVoucher('aabbccdd11223344aabbccdd11223344', 5, Number(now) + 3600, '11112222333344441111222233334444');
    assert.strictEqual((await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'X-Payment-Retry-Voucher': expiredVoucher } })).status, 402);
    assert.strictEqual((await fetch(`${baseUrl}/v1/chain/btc/mempool`, { headers: { 'X-Payment-Retry-Voucher': splitIdVoucher } })).status, 402);
  } finally { await close(); }
});
