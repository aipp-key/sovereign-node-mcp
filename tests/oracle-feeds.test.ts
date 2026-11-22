import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import http from 'node:http';
import { OracleFeedsService } from '../src/application/services/oracle-feeds.service.js';
import { L402Service } from '../src/application/services/l402.service.js';
import type { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';
import { parseRawBitcoinTx } from '../src/infrastructure/bitcoin/btc-rawtx-parser.helper.js';
import { BtcZmqWhaleIngestor } from '../src/infrastructure/bitcoin/btc-zmq-whale.ingestor.js';
import { EvmGasPulseIngestor, computeBlobBaseFeeWei, weiToGwei } from '../src/infrastructure/evm/evm-gas-pulse.ingestor.js';
import { StablecoinPegIngestor } from '../src/infrastructure/market/stablecoin-peg.ingestor.js';
import { createOracleFeedsRouter } from '../src/interfaces/http/controllers/oracle-feeds.controller.js';

function buildMinimalLegacyTx(satoshis: bigint): Buffer {
  const version = Buffer.from('02000000', 'hex');
  const vinCount = Buffer.from([1]);
  const prevTxid = Buffer.alloc(32, 0x11);
  const voutIdx = Buffer.alloc(4, 0);
  const scriptSigLen = Buffer.from([1]);
  const scriptSig = Buffer.from([0x00]);
  const sequence = Buffer.from('ffffffff', 'hex');
  const voutCount = Buffer.from([1]);
  const valueBuf = Buffer.alloc(8);
  valueBuf.writeBigUInt64LE(satoshis, 0);
  const scriptPubKeyLen = Buffer.from([2]);
  const scriptPubKey = Buffer.from([0x51, 0x00]);
  const locktime = Buffer.alloc(4, 0);
  return Buffer.concat([
    version,
    vinCount,
    prevTxid,
    voutIdx,
    scriptSigLen,
    scriptSig,
    sequence,
    voutCount,
    valueBuf,
    scriptPubKeyLen,
    scriptPubKey,
    locktime,
  ]);
}

function buildMinimalSegwitTx(satoshis: bigint): Buffer {
  const version = Buffer.from('02000000', 'hex');
  const markerFlag = Buffer.from([0x00, 0x01]);
  const vinCount = Buffer.from([1]);
  const prevTxid = Buffer.alloc(32, 0x22);
  const voutIdx = Buffer.alloc(4, 0);
  const scriptSigLen = Buffer.from([0]);
  const sequence = Buffer.from('ffffffff', 'hex');
  const voutCount = Buffer.from([1]);
  const valueBuf = Buffer.alloc(8);
  valueBuf.writeBigUInt64LE(satoshis, 0);
  const scriptPubKeyLen = Buffer.from([2]);
  const scriptPubKey = Buffer.from([0x00, 0x14]);
  const witness = Buffer.from([1, 2, 0xaa, 0xbb]);
  const locktime = Buffer.alloc(4, 0);
  return Buffer.concat([
    version,
    markerFlag,
    vinCount,
    prevTxid,
    voutIdx,
    scriptSigLen,
    sequence,
    voutCount,
    valueBuf,
    scriptPubKeyLen,
    scriptPubKey,
    witness,
    locktime,
  ]);
}

function createStubL402Service(): { l402: L402Service; paidPreimages: Map<string, string> } {
  const paidPreimages = new Map<string, string>();
  const gateway: ILightningGateway = {
    createL402Invoice: async (priceSats) => {
      const preimage = 'c'.repeat(64);
      const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
      paidPreimages.set(paymentHash, preimage);
      const macaroon = Buffer.from(
        JSON.stringify({ caveat: `payment_hash=${paymentHash}&price_sats=${priceSats}`, paymentHash })
      ).toString('base64');
      return {
        macaroon,
        invoice: `lnbc${priceSats}0n1pstub`,
        paymentHash,
        priceSats,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    },
    verifyMacaroon: () => ({ valid: true }),
    verifyPreimage: async (paymentHash, preimage) => ({
      isValid: paidPreimages.get(paymentHash) === preimage,
      paymentHash,
      preimage,
    }),
  };
  return { l402: new L402Service(gateway), paidPreimages };
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

describe('Oracle Feeds Units (Stablecoin Peg, EVM Gas Pulse, BTC ZMQ Whale)', () => {
  it('parses legacy and SegWit raw Bitcoin transactions with exact satoshi sums', () => {
    const legacy = parseRawBitcoinTx(buildMinimalLegacyTx(2_500_000_000n));
    assert.ok(legacy);
    assert.equal(legacy.segwit, false);
    assert.equal(legacy.totalOutputSats, 2_500_000_000n);
    assert.equal(legacy.totalOutputBtc, 25);
    assert.equal(legacy.txid.length, 64);

    const segwit = parseRawBitcoinTx(buildMinimalSegwitTx(1_250_000_000n));
    assert.ok(segwit);
    assert.equal(segwit.segwit, true);
    assert.equal(segwit.totalOutputSats, 1_250_000_000n);
    assert.equal(segwit.totalOutputBtc, 12.5);
    assert.ok(segwit.vsize < buildMinimalSegwitTx(1_250_000_000n).length);
  });

  it('computes stablecoin peg median, signed bps deviation, and depeg risk regime', () => {
    const ingestor = new StablecoinPegIngestor();
    const now = Date.now();
    ingestor.recordQuote('USDC', 'kraken', 'USDC/USD', 1.0001, now);
    ingestor.recordQuote('USDT', 'coinbase', 'USDT-USD', 0.9999, now);
    ingestor.recordQuote('USDE', 'binance', 'USDE/USDT->USD', 0.992, now);

    const snap = ingestor.getSnapshot(undefined, now);
    assert.equal(snap.activeAssetsCount, 3);
    assert.equal(snap.marketRegime, 'DEPEG_ALERT');
    const usdc = snap.assets.find((a) => a.symbol === 'USDC')!;
    assert.equal(usdc.status, 'PEGGED');
    const usde = snap.assets.find((a) => a.symbol === 'USDE')!;
    assert.equal(usde.status, 'DEPEG_WARNING');
    assert.ok((usde.deviationBps ?? 0) < -70);
  });

  it('tracks BigInt EVM gas pulse, EIP-4844 blob base fee, and 12-block rising trend', () => {
    assert.equal(weiToGwei(1_500_000_000n), 1.5);
    assert.ok(computeBlobBaseFeeWei(0n) === 1n);

    const gas = new EvmGasPulseIngestor();
    const t = Date.now();
    gas.recordHead('ethereum', { number: '0x10', baseFeePerGas: '0x3b9aca00', gasUsed: '0x7a1200', gasLimit: '0x1c9c380', excessBlobGas: '0x0' }, t - 3000);
    gas.recordHead('ethereum', { number: '0x11', baseFeePerGas: '0x59682f00', gasUsed: '0xe4e1c0', gasLimit: '0x1c9c380', excessBlobGas: '0x0' }, t - 2000);
    gas.recordHead('ethereum', { number: '0x12', baseFeePerGas: '0x77359400', gasUsed: '0x15f9000', gasLimit: '0x1c9c380', excessBlobGas: '0x0' }, t);

    const snap = gas.getSnapshot('ethereum', t);
    assert.equal(snap.activeChainsCount, 1);
    const eth = snap.chains[0]!;
    assert.equal(eth.baseFeeGwei, 2);
    assert.equal(eth.trend, 'RISING');
    assert.equal(eth.congestion, 'HIGH');
  });

  it('enforces 503 warming guard, 400 validation, 402 challenge, and 200 settlement on HTTP routes', async () => {
    const stable = new StablecoinPegIngestor();
    const gas = new EvmGasPulseIngestor();
    const whale = new BtcZmqWhaleIngestor();
    const svc = new OracleFeedsService(stable, gas, whale);
    const { l402, paidPreimages } = createStubL402Service();

    const app = express();
    app.use(createOracleFeedsRouter(svc, l402));
    const { baseUrl, close } = await startServer(app);

    try {
      // 1. Query validation runs before 503/402
      assert.equal((await fetch(`${baseUrl}/v1/intel/stablecoin-peg?symbol=INVALID`)).status, 400);
      assert.equal((await fetch(`${baseUrl}/v1/chain/evm/gas-pulse?chain=solana`)).status, 400);
      assert.equal((await fetch(`${baseUrl}/v1/chain/btc/whale-tape?minBtc=0`)).status, 400);

      // 2. Cold feeds fail safe with 503 Retry-After before invoicing
      const coldStable = await fetch(`${baseUrl}/v1/intel/stablecoin-peg`);
      assert.equal(coldStable.status, 503);
      assert.equal(coldStable.headers.get('retry-after'), '3');

      // 3. Seed feeds and verify 402 -> 200 settlement on all 3 endpoints
      const now = Date.now();
      stable.recordQuote('USDC', 'kraken', 'USDC/USD', 1.0, now);
      gas.recordHead('base', { number: '0x64', baseFeePerGas: '0x989680', gasUsed: '0x10', gasLimit: '0x100' }, now);
      whale.setConnectedForTest(true);
      whale.recordRawTx(buildMinimalLegacyTx(500_000_000n), now); // 5 BTC (excluded at minBtc=10)
      whale.recordRawTx(buildMinimalSegwitTx(1_500_000_000n), now); // 15 BTC (included)

      const verifyPaidRoute = async (path: string, expectedSats: number): Promise<any> => {
        const unpaid = await fetch(`${baseUrl}${path}`);
        assert.equal(unpaid.status, 402);
        const challenge = (await unpaid.json()) as any;
        assert.equal(challenge.challenge.priceSats, expectedSats);
        const preimage = paidPreimages.get(challenge.challenge.paymentHash)!;
        const paid = await fetch(`${baseUrl}${path}`, {
          headers: { Authorization: `L402 ${challenge.challenge.macaroon}:${preimage}` },
        });
        assert.equal(paid.status, 200);
        return paid.json();
      };

      const stableBody = await verifyPaidRoute('/v1/intel/stablecoin-peg?symbol=USDC', 2);
      assert.equal(stableBody.data.activeAssetsCount, 1);

      const gasBody = await verifyPaidRoute('/v1/chain/evm/gas-pulse?chain=base', 2);
      assert.equal(gasBody.data.activeChainsCount, 1);

      const whaleBody = await verifyPaidRoute('/v1/chain/btc/whale-tape', 3);
      assert.equal(whaleBody.data.matchedCount, 1);
      assert.equal(whaleBody.data.events[0].totalOutputBtc, 15);
    } finally {
      await close();
    }
  });
});
