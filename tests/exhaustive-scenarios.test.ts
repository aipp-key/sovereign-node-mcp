import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac, createHash } from 'crypto';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ILightningGateway } from '../src/application/interfaces/lightning.interface.js';
import { ILightningPayer } from '../src/application/interfaces/lightning-payer.interface.js';
import { INodeTruthRepository } from '../src/application/interfaces/node-truth.interface.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { NodeTruthService } from '../src/application/services/node-truth.service.js';
import { AutonomousL402Agent } from '../src/application/services/autonomous-agent-client.js';
import { verifyL402Macaroon } from '../src/infrastructure/lightning/macaroon.helper.js';
import {
  buildRbfFromMempoolEntry, buildCachedBlockTemplate, finalizeNextBlockXray,
  buildTxConsensusSimulation, parseBolt11AmountSats,
} from '../src/infrastructure/bitcoin/bitcoin-forensics.helper.js';
import { createNodeTruthRouter } from '../src/interfaces/http/controllers/node-truth.controller.js';
import { createOmniRailRouter } from '../src/interfaces/http/controllers/omni-rail.controller.js';
import { BASE_PAY_TO_ADDRESS } from '../src/interfaces/http/middleware/l402.middleware.js';
import { SOLANA_PAY_TO_ADDRESS, SOLANA_USDC_MINT } from '../src/interfaces/http/middleware/omni-rail.middleware.js';
import { createSovereignMcpServer } from '../src/interfaces/mcp/server.js';

const SECRET = process.env.MACAROON_SECRET || 'sovereign-l402-dev-secret-key-32b-min';
const VALID_TXID = 'ab'.repeat(32);
const VALID_RAW_TX = '0200000001' + '11'.repeat(60);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

function signChallengePair(priceSats: number) {
  const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const caveat = `payment_hash=${paymentHashHex}&expires_at=${expiresAt}&price_sats=${priceSats}`;
  const signature = createHmac('sha256', SECRET).update(caveat).digest('hex');
  return { preimageHex, paymentHashHex, expiresAt, macaroon: b64({ caveat, paymentHash: paymentHashHex, signature }) };
}
const makeSignedL402 = (priceSats: number) => {
  const c = signChallengePair(priceSats);
  return `L402 ${c.macaroon}:${c.preimageHex}`;
};

class TestL402Gateway implements ILightningGateway {
  public invoiceSecrets = new Map<string, { paymentHash: string; preimage: string }>();
  private seq = 0;
  async createL402Invoice(priceSats: number) {
    const c = signChallengePair(priceSats);
    const invoice = `lnbc${priceSats * 10}n1ptest${++this.seq}qpzry9x8gf2tvdw0s3jn54khce6mua7l`;
    this.invoiceSecrets.set(invoice, { paymentHash: c.paymentHashHex, preimage: c.preimageHex });
    return { macaroon: c.macaroon, invoice, paymentHash: c.paymentHashHex, priceSats, expiresAt: c.expiresAt };
  }
  verifyMacaroon(macaroon: string, expectedPriceSats?: number) { return verifyL402Macaroon(macaroon, SECRET, expectedPriceSats); }
  async verifyPreimage(paymentHash: string, preimage: string) {
    const ok = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex').toLowerCase() === paymentHash.toLowerCase();
    return ok ? { isValid: true, paymentHash, preimage } : { isValid: false, paymentHash, preimage, errorReason: 'Preimage mismatch' };
  }
  async isInvoiceSettled() { return true; }
}

function makeRepo(overrides: Partial<INodeTruthRepository> = {}): INodeTruthRepository {
  const ts = () => Math.floor(Date.now() / 1000);
  return {
    getMempoolEntropy: async () => ({ txCount: 41000, vsizeBytes: 15_000_000, totalFeeSats: 2_100_000, minFeeRateSatPerVb: 1, medianFeeRateSatPerVb: 1.5, fastFeeRateSatPerVb: 3, congestionLevel: 'HIGH', updatedAt: ts() }),
    getSmartFeeEstimates: async () => ({ fastestSatPerVb: 3.2, halfHourSatPerVb: 2.1, hourSatPerVb: 1.4, economicSatPerVb: 1, targetBlocksFastest: 2, targetBlocksEconomic: 6, updatedAt: ts() }),
    checkRbfShield: async (txid) => ({ txid, isInMempool: true, confirmations: 0, bip125Replaceable: false, vsize: 140, feeRateSatPerVb: 6, ancestorCount: 1, hasConflicts: false, zeroConfRiskLevel: 'SAFE', recommendation: 'Safe', updatedAt: ts() }),
    getLatestBlockHeader: async () => ({ height: 975900, hash: '0'.repeat(64), previousBlockHash: '0'.repeat(64), merkleRoot: '0'.repeat(64), timestamp: ts(), bits: '1701f2b4', nonce: 0, difficulty: 1e14, chain: 'main' }),
    getLightningTopology: async () => ({ activeChannels: 12, totalCapacitySats: 50_000_000, gossipUpdatesPerMinute: 35, routingFeeMedianPpm: 200, updatedAt: ts() }),
    getNextBlockXray: async (txid) => ({
      candidateBlockHeight: 975901, previousBlockHash: '0'.repeat(64), totalTransactions: 50, totalWeight: 2_000_000,
      blockFillPercentage: 50, totalFeeSats: 250_000, coinbaseRewardSats: 312_500_000, cutoffFeeRateSatPerVb: 1.2,
      medianFeeRateSatPerVb: 2.5, topFeeRateSatPerVb: 15, topWhaleTransactions: [],
      inspectedTransaction: txid ? { txid, inCandidateBlock: true, rankInBlock: 1, percentileInBlock: 100, feeSats: 5000, feeRateSatPerVb: 15, verdict: 'GUARANTEED_NEXT_BLOCK' } : undefined,
      updatedAt: ts(),
    }),
    simulateTxConsensus: async () => ({
      txid: VALID_TXID, wtxid: VALID_TXID, consensusAllowed: true, alreadyInMempool: false, rejectReason: null,
      vsize: 140, weight: 560, version: 2, locktime: 0, inputCount: 1, outputCount: 1, totalOutputSats: 100_000,
      signalsBip125Rbf: false, nextBlockCutoffSatPerVb: 1.2, broadcastedToNetwork: false, simulatedAt: ts(),
    }),
    ...overrides,
  };
}

async function startScenarioServer(opts: { repo?: INodeTruthRepository; payer?: ILightningPayer } = {}) {
  const gateway = new TestL402Gateway();
  const l402Service = new L402Service(gateway);
  const nodeTruthService = new NodeTruthService(opts.repo || makeRepo());
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createNodeTruthRouter(nodeTruthService, l402Service));
  app.use(createOmniRailRouter(nodeTruthService, l402Service, opts.payer));
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  return { baseUrl: `http://127.0.0.1:${port}`, gateway, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('SCENARIO 1: Bitcoin Forensics & BOLT-11 Parser Boundary Matrix', () => {
  const conflict = buildRbfFromMempoolEntry(VALID_TXID, { vsize: 200, fees: { base: 0.0001 }, spentby: ['cd'.repeat(32)] });
  assert.equal(conflict.hasConflicts && conflict.zeroConfRiskLevel === 'HIGH_RISK_RBF_ENABLED', true);
  assert.match(conflict.recommendation, /CRITICAL ALERT/);
  assert.match(buildRbfFromMempoolEntry(VALID_TXID, { vsize: 200, fees: { base: 0.0001 }, 'bip125-replaceable': true, ancestorcount: 1 }).recommendation, /BIP-125 RBF is enabled/);
  const rbfDeep = buildRbfFromMempoolEntry(VALID_TXID, { vsize: 200, ancestorsize: 1000, ancestorcount: 4, 'bip125-replaceable': true, fees: { base: 0.0001, ancestor: 0.0001 } });
  assert.equal(rbfDeep.feeRateSatPerVb, 10);
  assert.match(rbfDeep.recommendation, /ancestor chain depth: 4/);
  const medAnc = buildRbfFromMempoolEntry(VALID_TXID, { vsize: 200, ancestorsize: 200, ancestorcount: 3, fees: { base: 0.0001, ancestor: 0.0001 } });
  assert.equal(medAnc.zeroConfRiskLevel, 'MEDIUM_RISK');
  assert.match(medAnc.recommendation, /depth: 3/);
  const medLow = buildRbfFromMempoolEntry(VALID_TXID, { vsize: 200, fees: { base: 0.000001 } });
  assert.equal(medLow.zeroConfRiskLevel, 'MEDIUM_RISK');
  assert.match(medLow.recommendation, /Fee rate is low/);
  assert.equal(buildRbfFromMempoolEntry(VALID_TXID, { vsize: 200, ancestorcount: 2, ancestorsize: 200, fees: { base: 0.0001, ancestor: 0.0001 } }).zeroConfRiskLevel, 'SAFE');

  const emptyTpl = buildCachedBlockTemplate({ height: 975901, transactions: [] }, 1000);
  assert.equal(emptyTpl.baseXray.totalTransactions === 0 && emptyTpl.baseXray.cutoffFeeRateSatPerVb === 1 && emptyTpl.baseXray.topFeeRateSatPerVb === 0, true);
  const tx1 = '11'.repeat(32);
  const tpl = buildCachedBlockTemplate({ height: 975901, previousblockhash: '0'.repeat(64), coinbasevalue: 312_510_000, transactions: [{ txid: tx1, weight: 800, fee: 4000 }, { txid: '22'.repeat(32), weight: 400, fee: 500 }] }, 1000);
  assert.equal(finalizeNextBlockXray(tpl).inspectedTransaction, undefined);
  assert.equal(finalizeNextBlockXray(tpl, tx1).inspectedTransaction?.verdict, 'GUARANTEED_NEXT_BLOCK');
  assert.equal(finalizeNextBlockXray(tpl, tx1).inspectedTransaction?.percentileInBlock, 100);
  assert.equal(finalizeNextBlockXray(tpl, VALID_TXID, 2.25).inspectedTransaction?.verdict, 'QUEUED_FOR_LATER_BLOCK');
  assert.equal(finalizeNextBlockXray(tpl, VALID_TXID, null).inspectedTransaction?.verdict, 'NOT_IN_MEMPOOL');

  const simRbf = buildTxConsensusSimulation({ allowed: true }, { txid: VALID_TXID, hash: VALID_TXID, vsize: 110, weight: 440, vin: [{ sequence: 0xfffffffd }], vout: [{ value: 0.005 }] }, 1.5);
  assert.equal(simRbf.consensusAllowed && simRbf.signalsBip125Rbf && simRbf.totalOutputSats === 500_000, true);
  const simMem = buildTxConsensusSimulation({ allowed: false, 'reject-reason': 'txn-already-in-mempool' }, { txid: VALID_TXID, vin: [{ sequence: 0xfffffffe }], vout: [{ value: 0.001 }] }, 1.5);
  assert.equal(simMem.consensusAllowed && simMem.alreadyInMempool && !simMem.signalsBip125Rbf, true);
  assert.equal(buildTxConsensusSimulation({ allowed: false, 'reject-reason': 'bad-txns-inputs-missingorspent' }, { txid: VALID_TXID, vin: [{ sequence: 0xffffffff }], vout: [{ value: 0.001 }] }, 1.5).consensusAllowed, false);

  for (const [inv, expected] of [
    ['lnbc1m1p0xyz', 100_000], ['lnbc2u1p0xyz', 200], ['lnbc250n1p0xyz', 25], ['lnbc250000p1p0xyz', 25],
    ['  LNBC10N1P0XYZ  ', 1], ['lnbc1p1p0xyz', null], ['lnbc5n1p0xyz', null], ['lnbc0n1p0xyz', null],
    ['lntb10n1p0xyz', null], ['lnbcrt10n1p0xyz', null], ['lnbc10n1pabc0b', null], ['', null],
  ] as const) { assert.equal(parseBolt11AmountSats(inv), expected, `BOLT-11 parse failed: ${inv}`); }
});

test('SCENARIO 2: Full Route, Alias, Discovery Spec, Content Negotiation & CORS Preflight Matrix', async () => {
  const { baseUrl, close } = await startScenarioServer();
  try {
    for (const path of [`/v1/chain/btc/rbf-shield/${VALID_TXID}`, '/v1/omni/btc/mempool']) {
      const opt = await fetch(`${baseUrl}${path}`, { method: 'OPTIONS' });
      assert.equal(opt.status, 204);
      assert.match(opt.headers.get('access-control-allow-headers') || '', /X-Payment-Retry-Voucher/i);
      assert.match(opt.headers.get('access-control-expose-headers') || '', /X-Payment-Retry-Voucher/i);
    }
    assert.match(await (await fetch(`${baseUrl}/`, { headers: { Accept: 'text/html' } })).text(), /<html/i);
    assert.equal(((await (await fetch(`${baseUrl}/`, { headers: { Accept: 'application/json' } })).json()) as any).service, 'Sovereign Node Engine');
    assert.match(await (await fetch(`${baseUrl}/omni-test`)).text(), /<html/i);
    assert.match(await (await fetch(`${baseUrl}/llms.txt`)).text(), /node\.sovroute\.com/);
    assert.equal(((await (await fetch(`${baseUrl}/openapi.json`)).json()) as any).openapi, '3.1.0');
    assert.ok(((await (await fetch(`${baseUrl}/mcp-config.json`)).json()) as any).mcpServers);
    assert.equal(((await (await fetch(`${baseUrl}/health`)).json()) as any).status, 'UP');

    const getRoutes: [string, number][] = [
      ['/v1/truth/fees', 1], ['/v1/truth/mempool', 2], ['/v1/truth/block', 1], ['/v1/truth/topology', 5],
      [`/v1/truth/rbf-shield/${VALID_TXID}`, 5], ['/v1/truth/next-block-xray', 3], [`/v1/truth/next-block-xray/${VALID_TXID}`, 3],
      ['/v1/omni/btc/fees', 1], [`/v1/omni/btc/rbf-shield/${VALID_TXID}`, 5], [`/v1/omni/btc/next-block-xray/${VALID_TXID}`, 3],
    ];
    for (const [path, sats] of getRoutes) {
      assert.equal((await fetch(`${baseUrl}${path}`, { headers: { Authorization: makeSignedL402(sats) } })).status, 200, `Expected 200 on ${path}`);
    }
    for (const postPath of ['/v1/truth/simulate-tx', '/v1/omni/btc/simulate-tx']) {
      const res = await fetch(`${baseUrl}${postPath}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: makeSignedL402(5) },
        body: JSON.stringify({ rawTxHex: VALID_RAW_TX }),
      });
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as any).data.broadcastedToNetwork, false);
    }
  } finally { await close(); }
});

test('SCENARIO 3: On-Chain RPC Verification Edge Cases & Self-Transfer Attack', async () => {
  const { baseUrl, close } = await startScenarioServer();
  const realFetch = globalThis.fetch;
  try {
    const attacker = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const evmCases = [
      { tag: 'self_transfer', tx: { from: attacker, to: attacker, value: '0x5d21dba000' }, receipt: { status: '0x1', blockNumber: '0x10' } },
      { tag: 'reverted', tx: { from: attacker, to: BASE_PAY_TO_ADDRESS, value: '0x5d21dba000' }, receipt: { status: '0x0', blockNumber: '0x10' } },
      { tag: 'missing', tx: null, receipt: null },
      { tag: 'underpaid', tx: { from: attacker, to: BASE_PAY_TO_ADDRESS, value: '0x1' }, receipt: { status: '0x1', blockNumber: '0x10' } },
    ];
    let currentEvm = evmCases[0], evmThrow = false;
    let solMode: 'failed' | 'missing' | 'wrong_recipient' | 'throw' = 'failed';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('mainnet.base.org')) {
        if (evmThrow) throw new Error('EVM RPC offline');
        const body = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: body.method === 'eth_getTransactionReceipt' ? currentEvm.receipt : currentEvm.tx }), { status: 200 });
      }
      if (url.includes('solana.com')) {
        if (solMode === 'throw') throw new Error('Solana RPC offline');
        const result = solMode === 'missing' ? null
          : solMode === 'failed' ? { slot: 100, meta: { err: { InstructionError: [0, 'Custom'] }, fee: 5000 }, transaction: { message: { accountKeys: [SOLANA_PAY_TO_ADDRESS] } } }
            : { slot: 100, meta: { err: null, fee: 5000 }, transaction: { message: { accountKeys: ['OtherPubkey111111111111111111111111111111111'] } } };
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    for (let i = 0; i < evmCases.length; i++) {
      currentEvm = evmCases[i];
      assert.equal((await fetch(`${baseUrl}/v1/omni/btc/mempool`, { headers: { 'x-evm-payment': b64({ network: 'eip155:8453', verifyOnChain: true, txHash: `0x${String(i + 1).repeat(64)}` }) } })).status, 402, currentEvm.tag);
    }
    evmThrow = true;
    assert.equal((await fetch(`${baseUrl}/v1/omni/btc/mempool`, { headers: { 'x-evm-payment': b64({ network: 'eip155:8453', verifyOnChain: true, txHash: `0x${'f'.repeat(64)}` }) } })).status, 402);
    for (const mode of ['failed', 'missing', 'wrong_recipient', 'throw'] as const) {
      solMode = mode;
      assert.equal((await fetch(`${baseUrl}/v1/omni/btc/mempool`, { headers: { 'x-solana-payment': b64({ verifyOnChain: true, signature: `SolEdge_${mode}_${Date.now()}` }) } })).status, 402, mode);
    }
  } finally { globalThis.fetch = realFetch; await close(); }
});

test('SCENARIO 4: SUB-LIG /v1/omni/pay-lightning 500/503 Failure & 25-sat Retry Voucher Recovery', async () => {
  const solHdr = (tag: string) => b64({ network: 'solana:mainnet', to: SOLANA_PAY_TO_ADDRESS, asset: SOLANA_USDC_MINT, amount: '25000', signature: `${tag}_${Date.now()}` });
  const callBridge = (url: string, headers: Record<string, string>) =>
    fetch(`${url}/v1/omni/pay-lightning`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ invoice: 'lnbc50n1p4w7c87pp5hxkrcp' }) });

  const unconfigured = await startScenarioServer();
  try {
    const r503 = await callBridge(unconfigured.baseUrl, { 'x-solana-payment': solHdr('Sol503') });
    assert.equal(r503.status, 503);
    assert.ok(r503.headers.get('x-payment-retry-voucher'));
  } finally { await unconfigured.close(); }

  let failOnce = true;
  const payer: ILightningPayer = {
    async payInvoice() { if (failOnce) { failOnce = false; throw new Error('phoenixd offline'); } return { paymentHash: 'aa'.repeat(32), preimage: 'bb'.repeat(32), feeSat: 1 }; },
  };
  const srv = await startScenarioServer({ payer });
  try {
    const r500 = await callBridge(srv.baseUrl, { 'x-solana-payment': solHdr('Sol500') });
    assert.equal(r500.status, 500);
    const voucher = r500.headers.get('x-payment-retry-voucher')!;
    assert.ok(voucher);
    const rOk = await callBridge(srv.baseUrl, { 'x-payment-retry-voucher': voucher });
    assert.equal(rOk.status, 200);
    assert.equal(((await rOk.json()) as any).lightningSettlement.preimage, 'bb'.repeat(32));
    assert.equal((await callBridge(srv.baseUrl, { 'x-payment-retry-voucher': voucher })).status, 402);
  } finally { await srv.close(); }
});

test('SCENARIO 5: Cross-Endpoint Tier Downgrade Redemption & AutonomousL402Agent / MCP Self-Healing', async () => {
  let failRbfOnce = true, failFeeOnce = true;
  const repo = makeRepo({
    checkRbfShield: async (txid) => { if (failRbfOnce) { failRbfOnce = false; throw new Error('bitcoind lock'); } return makeRepo().checkRbfShield(txid); },
    getSmartFeeEstimates: async () => { if (failFeeOnce) { failFeeOnce = false; throw new Error('transient timeout'); } return makeRepo().getSmartFeeEstimates(); },
  });
  const srv = await startScenarioServer({ repo });
  try {
    const rFail = await fetch(`${srv.baseUrl}/v1/chain/btc/rbf-shield/${VALID_TXID}`, { headers: { Authorization: makeSignedL402(5) } });
    assert.equal(rFail.status, 500);
    const voucher5 = rFail.headers.get('x-payment-retry-voucher')!;
    assert.equal((await fetch(`${srv.baseUrl}/v1/chain/btc/next-block-xray`, { headers: { 'x-payment-retry-voucher': voucher5 } })).status, 200);
    assert.equal((await fetch(`${srv.baseUrl}/v1/chain/btc/fees`, { headers: { 'x-payment-retry-voucher': voucher5 } })).status, 402);

    const paidInvoices: string[] = [];
    const autoPayer: ILightningPayer = {
      async payInvoice(invoice: string) {
        paidInvoices.push(invoice);
        const s = srv.gateway.invoiceSecrets.get(invoice)!;
        return { paymentHash: s.paymentHash, preimage: s.preimage, feeSat: 0 };
      },
    };
    const feeRes = await new AutonomousL402Agent(autoPayer).fetch(`${srv.baseUrl}/v1/truth/fees`, { maxPriceSatsAllowed: 5 });
    assert.equal(feeRes.data.fastestSatPerVb, 3.2);
    assert.equal(paidInvoices.length, 1);

    failFeeOnce = true;
    const { server } = createSovereignMcpServer({ sovereignNodeUrl: srv.baseUrl, payer: autoPayer, maxPriceSatsAllowed: 5 });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'self-healing-mcp', version: '1.0.0' });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const mcpResult: any = await client.callTool({ name: 'get_bitcoin_smart_fees', arguments: {} });
    assert.notEqual(mcpResult.isError, true);
    assert.equal(JSON.parse(mcpResult.content[0].text).data.fastestSatPerVb, 3.2);
    assert.equal(paidInvoices.length, 2);
    await client.close();
    await server.close();
  } finally { await srv.close(); }
});
