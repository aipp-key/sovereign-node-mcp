import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseHtlcAdapter } from '../src/infrastructure/evm/base-htlc.adapter.js';
import { CrossRailSwapOrderSchema } from '../src/domain/schemas/htlc.schema.js';

test('BaseHtlcAdapter - Cryptographic Secret Generation & Preimage Verification', () => {
  const secretPair = BaseHtlcAdapter.generateSecretPair();

  assert.equal(secretPair.preimageHex.length, 64, 'Preimage must be 32 bytes (64 hex chars)');
  assert.equal(secretPair.paymentHashHex.length, 64, 'Payment hash must be 32 bytes (64 hex chars)');

  const isValid = BaseHtlcAdapter.verifyPreimage(secretPair.preimageHex, secretPair.paymentHashHex);
  assert.equal(isValid, true, 'Preimage verification must succeed with valid hash');

  const tamperedPreimage = secretPair.preimageHex.replace(/[0-9a-f]/, 'x');
  // Attempt with corrupted preimage
  const isCorruptedValid = BaseHtlcAdapter.verifyPreimage('00'.repeat(32), secretPair.paymentHashHex);
  assert.equal(isCorruptedValid, false, 'Preimage verification must fail for mismatching secret');
});

test('BaseHtlcAdapter - EVM Calldata Encoding for Cross-Rail Swaps', () => {
  const adapter = new BaseHtlcAdapter('0x0000000000000000000000000000000000000001');

  const { preimageHex, paymentHashHex } = BaseHtlcAdapter.generateSecretPair();
  const swapId = `0x${'aa'.repeat(32)}` as const;
  const hashlock = `0x${paymentHashHex}` as const;
  const preimage = `0x${preimageHex}` as const;
  const recipient = '0x1111111111111111111111111111111111111111' as const;
  const tokenContract = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const; // Base USDC
  const amount = 10_000_000n; // 10 USDC (6 decimals)
  const timelock = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // 1. Create swap calldata
  const createCalldata = adapter.encodeCreateSwap({
    swapId,
    recipient,
    tokenContract,
    amount,
    hashlock,
    timelock,
  });
  assert.ok(createCalldata.startsWith('0x'), 'Calldata must be valid hex');
  assert.ok(createCalldata.length > 10, 'Calldata must contain selector and arguments');

  // 2. Redeem calldata
  const redeemCalldata = adapter.encodeRedeem({
    swapId,
    preimage,
  });
  assert.ok(redeemCalldata.startsWith('0x'), 'Redeem calldata must be valid hex');

  // 3. Refund calldata
  const refundCalldata = adapter.encodeRefund({
    swapId,
  });
  assert.ok(refundCalldata.startsWith('0x'), 'Refund calldata must be valid hex');
});

test('CrossRailSwapOrderSchema - State Machine Validation', () => {
  const secretPair = BaseHtlcAdapter.generateSecretPair();

  const validOrder = {
    swapId: '550e8400-e29b-41d4-a716-446655440000',
    direction: 'BASE_USDC_TO_LIGHTNING_SATS' as const,
    paymentHash: secretPair.paymentHashHex,
    amountSats: 50_000,
    amountUsdcUnits: 50_000_000n, // 50 USDC
    baseTimelockBlocks: 1800,
    lightningCltvDelta: 144,
    initiatorAddress: '0x1234567890abcdef1234567890abcdef12345678',
    status: 'LOCKED' as const,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };

  const parsed = CrossRailSwapOrderSchema.safeParse(validOrder);
  assert.equal(parsed.success, true, 'Valid cross-rail order must pass schema validation');

  // Negative test: invalid address
  const invalidOrder = {
    ...validOrder,
    initiatorAddress: 'invalid-address',
  };
  const invalidParsed = CrossRailSwapOrderSchema.safeParse(invalidOrder);
  assert.equal(invalidParsed.success, false, 'Invalid address must fail schema validation');
});
