import test from 'node:test';
import assert from 'node:assert';
import { createHash } from 'crypto';
import {
  canonicalizeJson,
  toBase64Url,
  fromBase64Url,
  buildMppLightningChallenge,
  buildMppUsdcChallenge,
  parseMppAuthorizationHeader,
  buildMppPaymentReceiptHeader,
} from '../src/interfaces/http/middleware/mpp.helper.js';

test('MPP Helper: Deterministic JCS Canonicalization and Base64url', () => {
  const obj1 = { b: 2, a: 1, c: { z: 10, y: 20 } };
  const obj2 = { c: { y: 20, z: 10 }, a: 1, b: 2 };

  const jcs1 = canonicalizeJson(obj1);
  const jcs2 = canonicalizeJson(obj2);

  assert.strictEqual(jcs1, jcs2);
  assert.strictEqual(jcs1, '{"a":1,"b":2,"c":{"y":20,"z":10}}');

  const b64url = toBase64Url(jcs1);
  assert.ok(!b64url.includes('='));
  assert.ok(!b64url.includes('+'));
  assert.ok(!b64url.includes('/'));

  const decoded = fromBase64Url(b64url);
  assert.strictEqual(decoded, jcs1);
});

test('MPP Helper: buildMppLightningChallenge matches draft-lightning-charge-00 schema', () => {
  const preimageHex = 'a3f10123456789abcdef0123456789abcdef0123456789abcdef012345678901';
  const paymentHashHex = createHash('sha256').update(Buffer.from(preimageHex, 'hex')).digest('hex');

  const challenge = buildMppLightningChallenge({
    id: 'ch_test_123',
    realm: 'node.sovroute.com',
    amountSats: 25,
    invoice: 'lnbc250n1pjmockinvoice...',
    paymentHash: paymentHashHex,
    description: 'SovRoute Fee Projection Oracle',
    expiresAtSec: 1773576300,
  });

  assert.ok(challenge.headerValue.startsWith('Payment id="ch_test_123"'));
  assert.ok(challenge.headerValue.includes('method="lightning"'));
  assert.ok(challenge.headerValue.includes('intent="charge"'));
  assert.ok(challenge.headerValue.includes('request='));
  assert.ok(challenge.headerValue.includes('expires="2026-03-15T12:05:00.000Z"'));

  const decodedRequest = JSON.parse(fromBase64Url(challenge.requestBase64Url));
  assert.strictEqual(decodedRequest.amount, '25');
  assert.strictEqual(decodedRequest.currency, 'sat');
  assert.strictEqual(decodedRequest.description, 'SovRoute Fee Projection Oracle');
  assert.strictEqual(decodedRequest.methodDetails.invoice, 'lnbc250n1pjmockinvoice...');
  assert.strictEqual(decodedRequest.methodDetails.paymentHash, paymentHashHex);
  assert.strictEqual(decodedRequest.methodDetails.network, 'mainnet');
});

test('MPP Helper: buildMppUsdcChallenge matches draft-usdc-charge-00 schema', () => {
  const challenge = buildMppUsdcChallenge({
    id: 'ch_usdc_456',
    realm: 'node.sovroute.com',
    amountAtomic: '1000',
    recipient: '0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784',
    currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    description: 'SovRoute Memory Entropy Query',
    chainId: 8453,
    expiresAtSec: 1773576300,
  });

  assert.ok(challenge.headerValue.startsWith('Payment id="ch_usdc_456"'));
  assert.ok(challenge.headerValue.includes('method="usdc"'));
  assert.ok(challenge.headerValue.includes('intent="charge"'));

  const decodedRequest = JSON.parse(fromBase64Url(challenge.requestBase64Url));
  assert.strictEqual(decodedRequest.amount, '1000');
  assert.strictEqual(decodedRequest.recipient, '0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784');
  assert.strictEqual(decodedRequest.currency, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.strictEqual(decodedRequest.methodDetails.evm.chainId, 8453);
});

test('MPP Helper: parseMppAuthorizationHeader extracts Lightning preimage', () => {
  const preimage = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
  const expectedHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');

  const credentialToken = {
    challenge: {
      id: 'ch_test_123',
      realm: 'node.sovroute.com',
      method: 'lightning',
      intent: 'charge',
      request: toBase64Url(
        canonicalizeJson({
          amount: '10',
          currency: 'sat',
          methodDetails: { paymentHash: expectedHash, network: 'mainnet' },
        })
      ),
    },
    source: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    payload: {
      preimage,
    },
  };

  const header = `Payment ${toBase64Url(canonicalizeJson(credentialToken))}`;
  const parsed = parseMppAuthorizationHeader(header);

  assert.strictEqual(parsed.isMpp, true);
  assert.strictEqual(parsed.method, 'lightning');
  assert.strictEqual(parsed.intent, 'charge');
  assert.strictEqual(parsed.challengeId, 'ch_test_123');
  assert.strictEqual(parsed.preimage, preimage);
  assert.strictEqual(parsed.paymentHash, expectedHash);
  assert.strictEqual(parsed.error, undefined);
});

test('MPP Helper: parseMppAuthorizationHeader extracts USDC EIP-3009 credential', () => {
  const credentialToken = {
    challenge: {
      id: 'usdc_001',
      realm: 'node.sovroute.com',
      method: 'usdc',
      intent: 'charge',
    },
    payload: {
      type: 'authorization',
      from: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      to: '0x488cbdad29e60d8bae53fff4c4252c9711df9784',
      value: '1000',
      validAfter: '0',
      validBefore: '1900000000',
      nonce: '0x' + 'aa'.repeat(32),
      signature: '0x' + 'bb'.repeat(65),
    },
  };

  const header = `Payment ${toBase64Url(canonicalizeJson(credentialToken))}`;
  const parsed = parseMppAuthorizationHeader(header);

  assert.strictEqual(parsed.isMpp, true);
  assert.strictEqual(parsed.method, 'usdc');
  assert.ok(parsed.usdcAuthorization);
  assert.strictEqual(parsed.usdcAuthorization.from, '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
  assert.strictEqual(parsed.usdcAuthorization.value, '1000');
});

test('MPP Helper: buildMppPaymentReceiptHeader generates valid base64url receipt', () => {
  const receiptHeader = buildMppPaymentReceiptHeader({
    challengeId: 'ch_test_123',
    method: 'lightning',
    reference: 'bc230847abcdef1234567890',
  });

  assert.ok(receiptHeader);
  const decoded = JSON.parse(fromBase64Url(receiptHeader));
  assert.strictEqual(decoded.challengeId, 'ch_test_123');
  assert.strictEqual(decoded.method, 'lightning');
  assert.strictEqual(decoded.reference, 'bc230847abcdef1234567890');
  assert.strictEqual(decoded.status, 'success');
  assert.ok(decoded.timestamp);
});

test('MPP E2E: Express server issues standard MPP challenge and settles Lightning preimage', async () => {
  const express = (await import('express')).default;
  const { L402Service } = await import('../src/application/services/l402.service.js');
  const { createL402Middleware } = await import(
    '../src/interfaces/http/middleware/l402.middleware.js'
  );
  const { ILightningGateway } = await import(
    '../src/application/interfaces/lightning.interface.js'
  );

  class MockGateway implements ILightningGateway {
    public paid = new Map<string, string>();
    async createL402Invoice(priceSats: number) {
      const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
      this.paid.set(paymentHashHex, preimageHex);
      return {
        macaroon: Buffer.from(JSON.stringify({ paymentHash: paymentHashHex })).toString('base64'),
        invoice: `lnbc${priceSats * 10}n1testmock`,
        paymentHash: paymentHashHex,
        priceSats,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    }
    async verifyPreimage(paymentHash: string, preimage: string) {
      const hash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
      if (hash.toLowerCase() !== paymentHash.toLowerCase()) {
        return { isValid: false, errorReason: 'Invalid hash' };
      }
      return { isValid: true, paymentHash, preimage };
    }
    async isInvoiceSettled(paymentHash: string) {
      return this.paid.has(paymentHash);
    }
  }

  const gateway = new MockGateway();
  const service = new L402Service(gateway);

  const app = express();
  app.use(express.json());
  app.get(
    '/test-mpp',
    createL402Middleware(service, {
      priceSats: 25,
      resourceName: 'test-resource',
    }),
    (req, res) => {
      res.json({
        success: true,
        data: 'Secret Sovereign Data',
        paymentRail: (req as any).paymentRail,
        mpp: (req as any).mpp,
      });
    }
  );

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Initial GET request -> 402 Challenge
    const res402 = await fetch(`${baseUrl}/test-mpp`);
    assert.strictEqual(res402.status, 402);
    const wwwAuth = res402.headers.get('www-authenticate');
    assert.ok(wwwAuth, 'WWW-Authenticate header must be present');

    // Verify MPP Lightning Challenge exists in header
    assert.ok(wwwAuth.includes('method="lightning"'));
    assert.ok(wwwAuth.includes('intent="charge"'));

    const body402 = await res402.json();
    assert.ok(body402.mpp?.lightning);

    const paymentHash = body402.challenge.paymentHash;
    const preimage = gateway.paid.get(paymentHash)!;
    assert.ok(preimage, 'Preimage must exist in mock node');

    // 2. Client pays and retries with Authorization: Payment <token>
    const credentialToken = {
      challenge: {
        id: `ch_lig_${paymentHash.slice(0, 16)}`,
        realm: `127.0.0.1:${port}`,
        method: 'lightning',
        intent: 'charge',
        request: toBase64Url(
          canonicalizeJson({
            amount: '25',
            currency: 'sat',
            methodDetails: { paymentHash, network: 'mainnet' },
          })
        ),
      },
      payload: {
        preimage,
      },
    };

    const paymentAuthHeader = `Payment ${toBase64Url(canonicalizeJson(credentialToken))}`;
    const res200 = await fetch(`${baseUrl}/test-mpp`, {
      headers: {
        Authorization: paymentAuthHeader,
      },
    });

    assert.strictEqual(res200.status, 200);
    const body200 = await res200.json();
    assert.strictEqual(body200.success, true);
    assert.strictEqual(body200.paymentRail, 'MPP-LIGHTNING');
    assert.strictEqual(body200.mpp.preimage, preimage);

    // Verify Payment-Receipt header per draft-lightning-charge-00
    const receiptHeader = res200.headers.get('payment-receipt');
    assert.ok(receiptHeader, 'Payment-Receipt header must be returned on 200 OK');
    const decodedReceipt = JSON.parse(fromBase64Url(receiptHeader));
    assert.strictEqual(decodedReceipt.method, 'lightning');
    assert.strictEqual(decodedReceipt.status, 'success');
    assert.strictEqual(decodedReceipt.reference, paymentHash);

    // 3. Invalid preimage fails with 402
    const badToken = {
      ...credentialToken,
      payload: { preimage: '00'.repeat(32) },
    };
    const badAuthHeader = `Payment ${toBase64Url(canonicalizeJson(badToken))}`;
    const resBad = await fetch(`${baseUrl}/test-mpp`, {
      headers: {
        Authorization: badAuthHeader,
      },
    });

    assert.strictEqual(resBad.status, 402);
    const bodyBad = await resBad.json();
    assert.strictEqual(bodyBad.protocol, 'mpp');

    // 4. Client pays via MPP USDC EIP-3009 (with X402_SKIP_VERIFY=true for unit simulation)
    process.env.X402_SKIP_VERIFY = 'true';
    try {
      const usdcToken = {
        challenge: {
          id: `ch_usdc_${paymentHash.slice(0, 16)}`,
          realm: `127.0.0.1:${port}`,
          method: 'usdc',
          intent: 'charge',
        },
        payload: {
          type: 'authorization',
          from: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
          to: '0x488cbdad29e60d8bae53fff4c4252c9711df9784',
          value: '25000',
          validAfter: '0',
          validBefore: '1900000000',
          nonce: '0x' + '11'.repeat(32),
          signature: '0x' + '22'.repeat(65),
        },
      };

      const usdcAuthHeader = `Payment ${toBase64Url(canonicalizeJson(usdcToken))}`;
      const resUsdc = await fetch(`${baseUrl}/test-mpp`, {
        headers: {
          Authorization: usdcAuthHeader,
        },
      });

      assert.strictEqual(resUsdc.status, 200);
      const bodyUsdc = await resUsdc.json();
      assert.strictEqual(bodyUsdc.success, true);
      assert.strictEqual(bodyUsdc.paymentRail, 'MPP-BASE-USDC');
      assert.ok(resUsdc.headers.get('payment-receipt'));
    } finally {
      delete process.env.X402_SKIP_VERIFY;
    }
  } finally {
    server.close();
  }
});

