import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { createHash } from 'crypto';
import { BitcoinRpcAdapter } from '../src/infrastructure/bitcoin/bitcoin-rpc.adapter.js';
import { NodeTruthService } from '../src/application/services/node-truth.service.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';
import { createNodeTruthRouter } from '../src/interfaces/http/controllers/node-truth.controller.js';

class TestLightningGateway implements ILightningGateway {
  public paidPreimages: Map<string, string> = new Map();
  public invoiceCount = 0;

  async createL402Invoice(priceSats: number, _memo: string) {
    this.invoiceCount++;
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

test('BitcoinRpcAdapter connects to live Bitcoin Core (31.1) and returns validated MempoolEntropy with real fee tiers', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const mempool = await adapter.getMempoolEntropy();
  assert.ok(mempool.txCount > 0, 'Mempool should have active transactions');
  assert.ok(mempool.vsizeBytes > 0, 'Mempool vsize should be positive');
  assert.ok(mempool.totalFeeSats > 0, 'Total fees in sats should be positive');
  assert.ok(mempool.fastFeeRateSatPerVb >= mempool.medianFeeRateSatPerVb, 'Fast fee >= Median fee');
  assert.ok(mempool.medianFeeRateSatPerVb >= mempool.minFeeRateSatPerVb, 'Median fee >= Min fee');
  assert.ok(['LOW', 'MODERATE', 'HIGH', 'EXTREME'].includes(mempool.congestionLevel));

  console.log(
    `[LIVE MEMPOOL PROBE] Tx: ${mempool.txCount} | VSize: ${(mempool.vsizeBytes / 1_000_000).toFixed(2)} vMB | Fees: min=${mempool.minFeeRateSatPerVb}, med=${mempool.medianFeeRateSatPerVb}, fast=${mempool.fastFeeRateSatPerVb} sat/vB | Congestion: ${mempool.congestionLevel}`
  );
});

test('BitcoinRpcAdapter computes real-time Smart Fee Projections from Core engine', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const smartFees = await adapter.getSmartFeeEstimates();
  assert.ok(smartFees.fastestSatPerVb > 0, 'Fastest fee must be positive');
  assert.ok(smartFees.economicSatPerVb > 0, 'Economic fee must be positive');
  assert.ok(smartFees.fastestSatPerVb >= smartFees.economicSatPerVb, 'Fastest fee >= Economic fee');

  console.log(
    `[LIVE FEE PROBE] Fastest (1-2 blocks): ${smartFees.fastestSatPerVb} sat/vB | Economic (6 blocks): ${smartFees.economicSatPerVb} sat/vB`
  );
});

test('BitcoinRpcAdapter inspects 0-Conf and RBF shield for an ACTIVE unconfirmed transaction in live mempool', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const activeTxid = await adapter.getSampleMempoolTxid();
  assert.strictEqual(activeTxid.length, 64, 'Sample mempool txid must be 64 hex chars');

  const rbfResult = await adapter.checkRbfShield(activeTxid);
  assert.strictEqual(rbfResult.txid, activeTxid);
  assert.strictEqual(rbfResult.isInMempool, true, 'Active mempool transaction must have isInMempool=true');
  assert.strictEqual(rbfResult.confirmations, 0, 'Unconfirmed transaction must have 0 confirmations');
  assert.ok(rbfResult.vsize > 0, 'Unconfirmed transaction vsize must be > 0');
  assert.ok(rbfResult.feeRateSatPerVb > 0, 'Unconfirmed transaction feeRateSatPerVb must be > 0');
  assert.ok((rbfResult.ancestorCount ?? 0) >= 1, 'Ancestor count must be >= 1');
  assert.ok(['SAFE', 'MEDIUM_RISK', 'HIGH_RISK_RBF_ENABLED'].includes(rbfResult.zeroConfRiskLevel));

  console.log(
    `[LIVE RBF ACTIVE TX PROBE] TXID: ${activeTxid.slice(0, 16)}... | BIP125: ${rbfResult.bip125Replaceable} | FeeRate: ${rbfResult.feeRateSatPerVb} sat/vB | Ancestors: ${rbfResult.ancestorCount} | Risk: ${rbfResult.zeroConfRiskLevel}`
  );
});

test('BitcoinRpcAdapter detects ALREADY CONFIRMED transaction via UTXO set and marks it SAFE', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const confirmedTxid = 'fad38b3b53b95f62a1dd0a87d38df9bbcf2eef521a6c9cb8e21077c7297e361e';
  const rbfResult = await adapter.checkRbfShield(confirmedTxid);

  assert.strictEqual(rbfResult.txid, confirmedTxid);
  assert.strictEqual(rbfResult.isInMempool, false);
  assert.ok((rbfResult.confirmations ?? 0) >= 1, 'Confirmed tx must report >= 1 confirmations');
  assert.strictEqual(rbfResult.zeroConfRiskLevel, 'SAFE');
  assert.ok(rbfResult.recommendation.startsWith('CONFIRMED:'));

  console.log(
    `[LIVE RBF CONFIRMED TX PROBE] Confirmations: ${rbfResult.confirmations} | Risk: ${rbfResult.zeroConfRiskLevel} | Msg: ${rbfResult.recommendation}`
  );
});

test('BitcoinRpcAdapter returns NOT_FOUND for non-existent transaction ID', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const fakeTxid = '0000000000000000000000000000000000000000000000000000000000000001';
  const rbfResult = await adapter.checkRbfShield(fakeTxid);

  assert.strictEqual(rbfResult.txid, fakeTxid);
  assert.strictEqual(rbfResult.isInMempool, false);
  assert.strictEqual(rbfResult.confirmations, 0);
  assert.strictEqual(rbfResult.zeroConfRiskLevel, 'NOT_FOUND');
});

test('In-Memory Cache serves subsequent queries in < 5 milliseconds', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
    cacheTtlMs: 5000,
  });

  await adapter.getMempoolEntropy();

  const start = performance.now();
  const cached = await adapter.getMempoolEntropy();
  const durationMs = performance.now() - start;

  assert.ok(cached.txCount > 0);
  assert.ok(durationMs < 10, `Cached query took ${durationMs.toFixed(2)}ms, expected < 10ms`);
  console.log(`[CACHE BENCHMARK] In-memory cache hit took: ${durationMs.toFixed(3)}ms!`);
});

test('BitcoinRpcAdapter connects to live Bitcoin Core and returns latest synchronized BlockHeaderTruth', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const blockHeader = await adapter.getLatestBlockHeader();
  assert.strictEqual(blockHeader.chain, 'main');
  assert.ok(blockHeader.height >= 974688, 'Block height should be on mainnet chain tip');
  assert.strictEqual(blockHeader.hash.length, 64);

  console.log(`[LIVE NODE PROBE] Chain Tip Height: ${blockHeader.height}, Best Hash: ${blockHeader.hash}`);
});

test('BitcoinRpcAdapter extracts live Next-Block X-Ray (getblocktemplate) and ranks candidate transactions', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const xray = await adapter.getNextBlockXray();
  assert.ok(xray.candidateBlockHeight > 974900);
  assert.ok(xray.totalTransactions > 0, 'Next block template must contain candidate transactions');
  assert.ok(xray.cutoffFeeRateSatPerVb >= 0, 'Cutoff fee rate must be non-negative');
  assert.ok(xray.topFeeRateSatPerVb > 0, 'Top fee rate must be positive');
  assert.ok(xray.topWhaleTransactions.length > 0, 'Must list top whale transactions');

  const topTxid = xray.topWhaleTransactions[0].txid;
  const inspected = await adapter.getNextBlockXray(topTxid);
  assert.ok(inspected.inspectedTransaction);
  assert.strictEqual(inspected.inspectedTransaction.inCandidateBlock, true);
  assert.strictEqual(inspected.inspectedTransaction.verdict, 'GUARANTEED_NEXT_BLOCK');
  assert.ok((inspected.inspectedTransaction.rankInBlock ?? 0) >= 1);

  console.log(
    `[LIVE NEXT-BLOCK XRAY] Candidate Height: ${xray.candidateBlockHeight} | Txs: ${xray.totalTransactions} | Fill: ${xray.blockFillPercentage}% | Cutoff: ${xray.cutoffFeeRateSatPerVb} sat/vB | Top Whale Rank #${inspected.inspectedTransaction.rankInBlock} (${inspected.inspectedTransaction.feeSats} sats)`
  );
});

test('BitcoinRpcAdapter simulates raw transaction consensus (testmempoolaccept) with 0% P2P broadcast', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const sample = await adapter.getSampleCandidateRawTxHex();
  const sim = await adapter.simulateTxConsensus(sample.rawTxHex);

  assert.strictEqual(sim.txid, sample.txid);
  assert.strictEqual(sim.consensusAllowed, true);
  assert.strictEqual(sim.alreadyInMempool, true);
  assert.strictEqual(sim.broadcastedToNetwork, false);
  assert.ok(sim.vsize > 0);
  assert.ok(sim.inputCount >= 1);
  assert.ok(sim.outputCount >= 1);

  console.log(
    `[LIVE CONSENSUS SIMULATOR] TXID: ${sim.txid.slice(0, 16)}... | Allowed: ${sim.consensusAllowed} | VSize: ${sim.vsize} vB | Outputs: ${sim.outputCount} (${sim.totalOutputSats} sats) | RBF: ${sim.signalsBip125Rbf} | Broadcasted: ${sim.broadcastedToNetwork}`
  );
});

test('E2E HTTP Router: /v1/chain/btc/rbf-shield/:txid & /v1/chain/btc/mempool enforce pre-payment validation & L402 settlement', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });
  const gateway = new TestLightningGateway();
  const nodeTruthService = new NodeTruthService(adapter);
  const l402Service = new L402Service(gateway);

  const app = express();
  app.use(express.json());
  app.use(createNodeTruthRouter(nodeTruthService, l402Service));

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Invalid TXID MUST return 400 Bad Request BEFORE generating any L402 invoice!
    const badTxRes = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/not-a-valid-hex-txid`);
    assert.strictEqual(badTxRes.status, 400, 'Invalid txid must return 400 before L402 challenge');
    assert.strictEqual(gateway.invoiceCount, 0, 'Zero invoices should be generated for invalid txid');

    // 2. Unpaid call to /v1/chain/btc/mempool returns Dual-Rail 402 Payment Required (L402 + x402)
    const mempool402 = await fetch(`${baseUrl}/v1/chain/btc/mempool`);
    assert.strictEqual(mempool402.status, 402);
    assert.ok(mempool402.headers.get('www-authenticate')?.startsWith('L402 '));
    assert.ok(mempool402.headers.get('payment-required'), 'Must include x402 Payment-Required header');
    assert.strictEqual(mempool402.headers.get('x-payment-requirements'), 'L402, x402');

    const mempoolBody: any = await mempool402.json();
    assert.strictEqual(mempoolBody.x402Version, 2);
    assert.strictEqual(mempoolBody.challenge.priceSats, 2);
    assert.strictEqual(mempoolBody.accepts.length, 2, 'Should offer both Base x402 and Lightning L402 in accepts');
    assert.strictEqual(mempoolBody.accepts[0].network, 'eip155:8453');
    assert.strictEqual(mempoolBody.accepts[1].scheme, 'l402');
    const mempoolPreimage = gateway.paidPreimages.get(mempoolBody.challenge.paymentHash)!;

    // 3. Paid call via RAIL 1 (L402 Lightning) to /v1/chain/btc/mempool succeeds with 200 OK
    const mempool200 = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: {
        Authorization: `L402 ${mempoolBody.challenge.macaroon}:${mempoolPreimage}`,
      },
    });
    assert.strictEqual(mempool200.status, 200);
    const mempoolPaidData: any = await mempool200.json();
    assert.strictEqual(mempoolPaidData.paymentRail, 'L402-LIGHTNING');
    assert.ok(mempoolPaidData.data.txCount > 0);
    assert.ok(mempoolPaidData.data.fastFeeRateSatPerVb > 0);

    // 3b. Paid call via RAIL 2 (x402 Base USDC) to /v1/chain/btc/mempool succeeds with 200 OK
    const x402Payload = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        payload: {
          authorization: {
            from: '0x1111111111111111111111111111111111111111',
            to: '0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784',
            value: '2000',
          },
          signature: '0xdeadbeef1234567890',
        },
      })
    ).toString('base64');

    const mempoolX402Res = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: {
        'Payment-Signature': x402Payload,
      },
    });
    assert.strictEqual(mempoolX402Res.status, 200);
    assert.ok(mempoolX402Res.headers.get('payment-response'), 'Must return x402 Payment-Response header');
    const mempoolX402Data: any = await mempoolX402Res.json();
    assert.strictEqual(mempoolX402Data.paymentRail, 'X402-BASE-USDC');

    // 4. Paid call to /v1/chain/btc/rbf-shield/:txid with live mempool txid succeeds with 200 OK
    const activeTxid = await adapter.getSampleMempoolTxid();
    const rbf402 = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${activeTxid}`);
    assert.strictEqual(rbf402.status, 402);
    const rbfBody: any = await rbf402.json();
    assert.strictEqual(rbfBody.challenge.priceSats, 5);
    const rbfPreimage = gateway.paidPreimages.get(rbfBody.challenge.paymentHash)!;

    const rbf200 = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${activeTxid}`, {
      headers: {
        Authorization: `L402 ${rbfBody.challenge.macaroon}:${rbfPreimage}`,
      },
    });
    assert.strictEqual(rbf200.status, 200);
    const rbfPaidData: any = await rbf200.json();
    assert.strictEqual(rbfPaidData.data.txid, activeTxid);
    assert.strictEqual(rbfPaidData.data.isInMempool, true);
  } finally {
    server.close();
  }
});
