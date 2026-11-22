import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import http from 'node:http';
import { Eip7702ShieldService } from '../src/application/services/eip7702-shield.service.js';
import {
  disassembleEvmBytecode,
  Eip7702ScannerAdapter,
} from '../src/infrastructure/evm/eip7702-scanner.adapter.js';
import { createEvmShieldRouter } from '../src/interfaces/http/controllers/evm-shield.controller.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';
import { L402Challenge, L402VerificationResult } from '../src/domain/schemas/l402.schema.js';
import { verifyL402Macaroon } from '../src/infrastructure/lightning/macaroon.helper.js';

const TEST_SECRET = 'test-eip7702-secret-key-32-bytes-minimum';
const TEST_PREIMAGE = '11'.repeat(32);
const TEST_PAYMENT_HASH = crypto.createHash('sha256').update(Buffer.from(TEST_PREIMAGE, 'hex')).digest('hex');

function buildMockMacaroon(paymentHash: string, priceSats: number, expiresAt: number): string {
  const caveat = `payment_hash=${paymentHash}&price_sats=${priceSats}&expires_at=${expiresAt}`;
  const signature = crypto.createHmac('sha256', TEST_SECRET).update(caveat).digest('hex');
  return Buffer.from(JSON.stringify({ caveat, paymentHash, signature })).toString('base64');
}

class MockLightningGateway implements ILightningGateway {
  async createL402Invoice(priceSats: number): Promise<L402Challenge> {
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const macaroon = buildMockMacaroon(TEST_PAYMENT_HASH, priceSats, expiresAt);
    return {
      invoice: 'lnbc50n1mockinvoice',
      paymentHash: TEST_PAYMENT_HASH,
      macaroon,
      amountSats: priceSats,
      expiresAt,
    };
  }
  async verifyPreimage(paymentHash: string, preimage: string): Promise<L402VerificationResult> {
    const valid = paymentHash === TEST_PAYMENT_HASH && preimage === TEST_PREIMAGE;
    return { isValid: valid, paymentHash, preimage };
  }
  async isInvoiceSettled(paymentHash: string): Promise<boolean> {
    return paymentHash === TEST_PAYMENT_HASH;
  }
  verifyMacaroon(macaroon: string, expectedPriceSats?: number): { valid: boolean; reason?: string } {
    return verifyL402Macaroon(macaroon, TEST_SECRET, expectedPriceSats);
  }
}

test('disassembleEvmBytecode skips PUSH32 immediate bytes without false positives', () => {
  // PUSH32 (0x7f) followed by 32 bytes of 0xff/0xf4, then STOP (0x00)
  const push32Safe = '0x7f' + 'fff4f0f5'.repeat(8) + '00';
  const res = disassembleEvmBytecode(push32Safe);
  assert.equal(res.bytecodeSizeBytes, 34);
  assert.equal(res.opcodes.selfdestruct, false);
  assert.equal(res.opcodes.delegatecall, false);
  assert.equal(res.opcodes.create, false);
  assert.equal(res.opcodes.create2, false);
});

test('Eip7702ScannerAdapter classifies audited standard & revocation as SAFE_VERIFIED', async () => {
  const scanner = new Eip7702ScannerAdapter({
    getCode: async () => '0x608060405200',
  });

  const report = await scanner.inspectAuthorizationList({
    executionChainId: 8453,
    authorizationList: [
      {
        chainId: 8453,
        address: '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b',
        nonce: 0,
      },
      {
        chainId: 8453,
        address: '0x0000000000000000000000000000000000000000',
        nonce: 1,
      },
    ],
  });

  assert.equal(report.verdict, 'SAFE_VERIFIED');
  assert.equal(report.riskScore, 0);
  assert.equal(report.entries[0].reputation, 'VERIFIED_STANDARD');
  assert.equal(report.entries[1].isRevocation, true);
});

test('Eip7702ScannerAdapter flags chainId=0 wildcard, SELFDESTRUCT, and DELEGATECALL+transferFrom as CRITICAL_DRAIN_RISK', async () => {
  const scanner = new Eip7702ScannerAdapter({
    getCode: async () => '0x',
  });

  const report = await scanner.inspectAuthorizationList({
    executionChainId: 8453,
    authorizationList: [
      {
        chainId: 0,
        address: '0x1111111111111111111111111111111111111111',
        nonce: 0,
        // PUSH4 transferFrom (0x23b872dd) + DELEGATECALL (0xf4) + SELFDESTRUCT (0xff)
        bytecode: '0x6323b872ddf4ff',
      },
    ],
  });

  assert.equal(report.verdict, 'CRITICAL_DRAIN_RISK');
  assert.ok(report.riskScore >= 75);
  assert.equal(report.entries[0].crossChainReplayRisk, true);
  assert.equal(report.entries[0].detectedOpcodes.selfdestruct, true);
  assert.equal(report.entries[0].detectedOpcodes.delegatecall, true);
  assert.ok(report.entries[0].detectedDrainSelectors.some((s) => s.includes('transferFrom')));
});

test('EVM Shield HTTP Router enforces 402 discovery, 400 validation, and 200 L402 settlement', async () => {
  const scanner = new Eip7702ScannerAdapter({
    getCode: async () => '0x608060405200',
  });
  const shieldService = new Eip7702ShieldService(scanner);
  const l402Service = new L402Service(new MockLightningGateway());

  const app = express();
  app.use(express.json());
  app.use(createEvmShieldRouter(shieldService, l402Service));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Unauthenticated probe must return 402 Payment Required with payment-required header
    const probeRes = await fetch(`${baseUrl}/v1/chain/evm/eip7702-shield`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(probeRes.status, 402);
    assert.ok(probeRes.headers.get('payment-required'));
    const wwwAuth = probeRes.headers.get('www-authenticate') || '';
    const macMatch = wwwAuth.match(/macaroon="([^"]+)"/);
    assert.ok(macMatch, 'L402 macaroon challenge returned');

    // 2. Paid request with invalid body returns 400
    const badRes = await fetch(`${baseUrl}/v1/chain/evm/eip7702-shield`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `L402 ${macMatch[1]}:${TEST_PREIMAGE}`,
      },
      body: JSON.stringify({ authorizationList: [] }),
    });
    assert.equal(badRes.status, 400);

    // 3. Paid request with valid authorizationList returns 200 OK
    const okRes = await fetch(`${baseUrl}/v1/chain/evm/eip7702-shield`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `L402 ${macMatch[1]}:${TEST_PREIMAGE}`,
      },
      body: JSON.stringify({
        executionChainId: 8453,
        authorizationList: [
          {
            chainId: 8453,
            address: '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b',
            nonce: 0,
          },
        ],
      }),
    });
    assert.equal(okRes.status, 200);
    const body: any = await okRes.json();
    assert.equal(body.data.verdict, 'SAFE_VERIFIED');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
