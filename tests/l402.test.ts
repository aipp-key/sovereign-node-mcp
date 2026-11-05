import test from 'node:test';
import assert from 'node:assert';
import { createHash } from 'crypto';
import { L402Service } from '../src/application/services/l402.service.js';
import { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';
import { toSatoshi } from '../src/domain/types/primitives.js';
import { MempoolEntropySchema } from '../src/domain/schemas/node-truth.schema.js';

class MockLightningGateway implements ILightningGateway {
  public paidPreimages: Map<string, string> = new Map();

  async createL402Invoice(priceSats: number, _memo: string) {
    const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
    this.paidPreimages.set(paymentHashHex, preimageHex);
    return {
      macaroon: Buffer.from(JSON.stringify({ paymentHash: paymentHashHex })).toString('base64'),
      invoice: `lnbc${priceSats * 10}n1mockinvoice`,
      paymentHash: paymentHashHex,
      priceSats,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async verifyPreimage(paymentHash: string, preimage: string) {
    const computedHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
    if (computedHash.toLowerCase() !== paymentHash.toLowerCase()) {
      return { isValid: false, errorReason: 'Hash mismatch' };
    }
    return { isValid: true, paymentHash, preimage };
  }

  async isInvoiceSettled(paymentHash: string) {
    return this.paidPreimages.has(paymentHash);
  }
}

test('Satoshi Primitive enforces integer non-negative amounts', () => {
  assert.strictEqual(toSatoshi(100) as number, 100);
  assert.throws(() => toSatoshi(-5), /Invalid Satoshi value/);
  assert.throws(() => toSatoshi(10.5), /Invalid Satoshi value/);
});

test('L402 Service generates valid cryptographic challenge and verifies valid preimage', async () => {
  const gateway = new MockLightningGateway();
  const service = new L402Service(gateway);

  // 1. Generate challenge
  const challenge = await service.generateChallenge(25, '/v1/truth/mempool');
  assert.strictEqual(challenge.priceSats, 25);
  assert.strictEqual(challenge.paymentHash.length, 64);

  // 2. Retrieve preimage from mock (as if Lightning paid)
  const preimage = gateway.paidPreimages.get(challenge.paymentHash)!;
  assert.ok(preimage);

  // 3. Verify valid authorization header
  const authHeader = `L402 ${challenge.macaroon}:${preimage}`;
  const result = await service.verifyAuthorizationHeader(authHeader);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.paymentHash, challenge.paymentHash);
  assert.strictEqual(result.preimage, preimage);

  // 4. Verify invalid preimage fails
  const invalidPreimage = '00'.repeat(32);
  const badAuthHeader = `L402 ${challenge.macaroon}:${invalidPreimage}`;
  const badResult = await service.verifyAuthorizationHeader(badAuthHeader);
  assert.strictEqual(badResult.isValid, false);
});

test('MempoolEntropySchema validates healthy node entropy payload', () => {
  const payload = {
    txCount: 65420,
    vsizeBytes: 34120000,
    totalFeeSats: 26695232,
    minFeeRateSatPerVb: 1.0,
    medianFeeRateSatPerVb: 1.5,
    fastFeeRateSatPerVb: 3.0,
    congestionLevel: 'HIGH',
    updatedAt: Math.floor(Date.now() / 1000),
  };

  const parsed = MempoolEntropySchema.parse(payload);
  assert.strictEqual(parsed.txCount, 65420);
  assert.strictEqual(parsed.congestionLevel, 'HIGH');
});
