import test from 'node:test';
import assert from 'node:assert';

process.env.X402_SKIP_VERIFY = 'true';
import express from 'express';
import { createHash } from 'crypto';
import { NodeTruthService } from '../src/application/services/node-truth.service.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';
import { INodeTruthRepository } from '../src/application/interfaces/node-truth.interface.js';
import { createOmniRailRouter } from '../src/interfaces/http/controllers/omni-rail.controller.js';
import {
  SOLANA_PAY_TO_ADDRESS,
  SOLANA_USDC_MINT,
} from '../src/interfaces/http/middleware/omni-rail.middleware.js';
import { BASE_PAY_TO_ADDRESS } from '../src/interfaces/http/middleware/l402.middleware.js';

class MockOmniLightningGateway implements ILightningGateway {
  public paidPreimages: Map<string, string> = new Map();

  async createL402Invoice(priceSats: number, _memo: string) {
    const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
    this.paidPreimages.set(paymentHashHex, preimageHex);
    return {
      macaroon: Buffer.from(JSON.stringify({ paymentHash: paymentHashHex })).toString('base64'),
      invoice: `lnbc${priceSats * 10}n1omniinvoice`,
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

class MockNodeTruthRepo implements INodeTruthRepository {
  async getMempoolEntropy() {
    return {
      txCount: 54000,
      vsizeBytes: 12500000,
      totalFeeSats: 4200000,
      minFeeRateSatPerVb: 0.1,
      medianFeeRateSatPerVb: 1.1,
      fastFeeRateSatPerVb: 2.2,
      congestionLevel: 'HIGH' as const,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  async getSmartFeeEstimates() {
    return {
      fastestSatPerVb: 2.2,
      halfHourSatPerVb: 1.5,
      hourSatPerVb: 1.2,
      economicSatPerVb: 1.1,
      targetBlocksFastest: 2,
      targetBlocksEconomic: 6,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  async checkRbfShield(txid: string) {
    return {
      txid,
      isInMempool: true,
      confirmations: 0,
      bip125Replaceable: false,
      vsize: 140,
      feeRateSatPerVb: 15.0,
      ancestorCount: 1,
      hasConflicts: false,
      zeroConfRiskLevel: 'SAFE' as const,
      recommendation: 'Safe for instant 0-conf settlement.',
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  async getLatestBlockHeader() {
    return {
      height: 974945,
      hash: '000000000000000000017a75a379300e69dddb206e0c6444a5c2264ce04550e4',
      previousBlockHash: '000000000000000000017a75a379300e69dddb206e0c6444a5c2264ce04550e4',
      merkleRoot: '00'.repeat(32),
      timestamp: Math.floor(Date.now() / 1000),
      bits: '1701f2b4',
      nonce: 0,
      difficulty: 100000000,
      chain: 'main' as const,
    };
  }

  async getLightningTopology() {
    return {
      activeChannels: 32000,
      totalCapacitySats: 380000000000,
      gossipUpdatesPerMinute: 45,
      routingFeeMedianPpm: 200,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }
}

test('Quad-Rail (/v1/omni/*) Gateway: Verifies all 4 payment rails (Lightning L402, Base USDC, Solana SOL/USDC, Multi-EVM Arbitrum/Ethereum) & Anti-Replay', async () => {
  const gateway = new MockOmniLightningGateway();
  const l402Service = new L402Service(gateway);
  const nodeTruthService = new NodeTruthService(new MockNodeTruthRepo());

  const app = express();
  app.use(express.json());
  const mockPayer = {
    paidInvoices: [] as string[],
    async payInvoice(inv: string) {
      this.paidInvoices.push(inv);
      return {
        paymentHash: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
        preimage: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
        feeSat: 1,
      };
    },
  };
  app.use(createOmniRailRouter(nodeTruthService, l402Service, mockPayer));

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 0. Check discovery endpoint /v1/omni/rails
    const discoveryRes = await fetch(`${baseUrl}/v1/omni/rails`);
    assert.strictEqual(discoveryRes.status, 200);
    const discoveryJson: any = await discoveryRes.json();
    assert.strictEqual(discoveryJson.rails.length, 4, 'Discovery must advertise 4 distinct rails');

    // 1. Unpaid call to /v1/omni/btc/mempool returns 402 with 4 accepts items
    const res402 = await fetch(`${baseUrl}/v1/omni/btc/mempool`);
    assert.strictEqual(res402.status, 402);
    const body402: any = await res402.json();
    assert.strictEqual(body402.accepts.length, 4, '402 challenge must include all 4 rails');

    // 2. RAIL 1: Native Bitcoin Lightning (L402)
    const preimage = gateway.paidPreimages.get(body402.challenge.paymentHash)!;
    const rail1Res = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: {
        Authorization: `L402 ${body402.challenge.macaroon}:${preimage}`,
      },
    });
    assert.strictEqual(rail1Res.status, 200);
    const rail1Data: any = await rail1Res.json();
    assert.strictEqual(rail1Data.paymentRail, 'RAIL-1:L402-LIGHTNING-SATS');

    // 3. RAIL 2: Base L2 USDC (x402)
    const rail2Payload = Buffer.from(
      JSON.stringify({
        network: 'eip155:8453',
        payload: {
          authorization: {
            from: '0x2222222222222222222222222222222222222222',
            to: BASE_PAY_TO_ADDRESS,
            value: '2000',
          },
          signature: '0xbase_sig_unique_001',
        },
      })
    ).toString('base64');

    const rail2Res = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'Payment-Signature': rail2Payload },
    });
    assert.strictEqual(rail2Res.status, 200);
    const rail2Data: any = await rail2Res.json();
    assert.strictEqual(rail2Data.paymentRail, 'RAIL-2:BASE-X402-USDC');

    // 4. RAIL 3A: Solana SPL USDC & Anti-Replay Check
    const solanaUsdcPayload = Buffer.from(
      JSON.stringify({
        network: 'solana:mainnet',
        to: SOLANA_PAY_TO_ADDRESS,
        asset: SOLANA_USDC_MINT,
        amount: '2000',
        signature: '5SolanaSplUsdcTxSigUnique0000000000000000000001',
      })
    ).toString('base64');

    const rail3UsdcRes = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-Solana-Payment': solanaUsdcPayload },
    });
    assert.strictEqual(rail3UsdcRes.status, 200);
    const rail3UsdcData: any = await rail3UsdcRes.json();
    assert.strictEqual(rail3UsdcData.paymentRail, 'RAIL-3:SOLANA-SPL-USDC');

    // Replay of the exact same Solana signature MUST fail with 402
    const rail3ReplayRes = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-Solana-Payment': solanaUsdcPayload },
    });
    assert.strictEqual(rail3ReplayRes.status, 402, 'Solana signature replay must be rejected');

    // 5. RAIL 3B: Solana Native SOL (Lamports)
    const solanaSolPayload = Buffer.from(
      JSON.stringify({
        network: 'solana:mainnet',
        to: SOLANA_PAY_TO_ADDRESS,
        asset: 'SOL',
        amount: '10000',
        signature: '5SolanaNativeSolTxSigUnique00000000000000000002',
      })
    ).toString('base64');

    const rail3SolRes = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-Solana-Payment': solanaSolPayload },
    });
    assert.strictEqual(rail3SolRes.status, 200);
    const rail3SolData: any = await rail3SolRes.json();
    assert.strictEqual(rail3SolData.paymentRail, 'RAIL-3:SOLANA-NATIVE-SOL');

    // 6. RAIL 4A: Multi-EVM — Arbitrum One USDC (eip155:42161)
    const arbUsdcPayload = Buffer.from(
      JSON.stringify({
        network: 'eip155:42161',
        authorization: {
          from: '0x3333333333333333333333333333333333333333',
          to: BASE_PAY_TO_ADDRESS,
          value: '2000',
        },
        signature: '0xarbitrum_usdc_sig_001',
      })
    ).toString('base64');

    const rail4ArbRes = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-EVM-Payment': arbUsdcPayload },
    });
    assert.strictEqual(rail4ArbRes.status, 200);
    const rail4ArbData: any = await rail4ArbRes.json();
    assert.strictEqual(rail4ArbData.paymentRail, 'RAIL-4:EVM-ARBITRUM-ONE-USDC');

    // 7. RAIL 4B: Multi-EVM — Ethereum Mainnet Native ETH (eip155:1)
    const ethNativePayload = Buffer.from(
      JSON.stringify({
        network: 'eip155:1',
        authorization: {
          from: '0x4444444444444444444444444444444444444444',
          to: BASE_PAY_TO_ADDRESS,
          asset: 'ETH',
          value: '600000000000',
        },
        signature: '0xeth_mainnet_native_sig_001',
      })
    ).toString('base64');

    const rail4EthRes = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-EVM-Payment': ethNativePayload },
    });
    assert.strictEqual(rail4EthRes.status, 200);
    const rail4EthData: any = await rail4EthRes.json();
    assert.strictEqual(rail4EthData.paymentRail, 'RAIL-4:EVM-ETHEREUM-MAINNET-ETH');

    // 8. SUB-LIG Walletless Lightning Bridge (/v1/omni/pay-lightning):
    // 8a. Rejects invoice > 25 sats BEFORE charging user
    const overCapRes = await fetch(`${baseUrl}/v1/omni/pay-lightning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice: 'lnbc1m1p4w7c87pp5hxkrcp' }), // 1m = 100,000 sats > 25 sats cap
    });
    assert.strictEqual(overCapRes.status, 400, 'Over-cap invoice must return 400 before payment');

    // 8b. Settles valid 5-sat invoice (lnbc50n1...) when paid via Solana USDC
    const bridgeSolPayload = Buffer.from(
      JSON.stringify({
        network: 'solana:mainnet',
        to: SOLANA_PAY_TO_ADDRESS,
        asset: SOLANA_USDC_MINT,
        amount: '25000',
        signature: '5SolanaSubLigBridgeSigUnique00000000000000000009',
      })
    ).toString('base64');

    const bridgeRes = await fetch(`${baseUrl}/v1/omni/pay-lightning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Solana-Payment': bridgeSolPayload,
      },
      body: JSON.stringify({ invoice: 'lnbc50n1p4w7c87pp5hxkrcp' }), // 50n = 5 sats
    });
    assert.strictEqual(bridgeRes.status, 200);
    const bridgeData: any = await bridgeRes.json();
    assert.strictEqual(bridgeData.status, 'SETTLED');
    assert.strictEqual(bridgeData.lightningSettlement.invoiceAmountSats, 5);
    assert.strictEqual(
      bridgeData.lightningSettlement.preimage,
      '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff'
    );
  } finally {
    server.close();
  }
});
