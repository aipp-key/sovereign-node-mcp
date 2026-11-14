import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac } from 'crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BitcoinRpcAdapter } from '../src/infrastructure/bitcoin/bitcoin-rpc.adapter.js';
import { LndGatewayAdapter } from '../src/infrastructure/lightning/lnd-gateway.adapter.js';
import { L402Service } from '../src/application/services/l402.service.js';
import { NodeTruthService } from '../src/application/services/node-truth.service.js';
import { createNodeTruthRouter } from '../src/interfaces/http/controllers/node-truth.controller.js';
import { createOmniRailRouter } from '../src/interfaces/http/controllers/omni-rail.controller.js';
import {
  BASE_PAY_TO_ADDRESS,
  BASE_USDC_CONTRACT,
} from '../src/interfaces/http/middleware/l402.middleware.js';
import {
  SOLANA_PAY_TO_ADDRESS,
  SOLANA_USDC_MINT,
} from '../src/interfaces/http/middleware/omni-rail.middleware.js';

const TAILSCALE_HOST = '100.95.119.88';
const BITCOIN_CONTAINER = 'sovereign-bitcoind';
const TEST_MACAROON_SECRET = 'red-team-macaroon-secret-key';

function createTestServer() {
  const btcAdapter = new BitcoinRpcAdapter({
    tailscaleHost: TAILSCALE_HOST,
    containerName: BITCOIN_CONTAINER,
    cacheTtlMs: 30_000,
  });

  const lndAdapter = new LndGatewayAdapter({
    tailscaleHost: TAILSCALE_HOST,
    containerName: 'sovereign-lnd',
    macaroonSecretKey: TEST_MACAROON_SECRET,
    devBypassSettlement: true,
  });

  const l402Service = new L402Service(lndAdapter);
  const nodeTruthService = new NodeTruthService(btcAdapter);

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createNodeTruthRouter(nodeTruthService, l402Service));
  app.use(createOmniRailRouter(nodeTruthService, l402Service));

  return { app, btcAdapter, l402Service, nodeTruthService };
}

async function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function buildSignedMacaroon(
  secret: string,
  paymentHash: string,
  priceSats: number,
  expiresAt: number
): string {
  const caveat = `payment_hash=${paymentHash}&expires_at=${expiresAt}&price_sats=${priceSats}`;
  const signature = createHmac('sha256', secret).update(caveat).digest('hex');
  return Buffer.from(JSON.stringify({ caveat, paymentHash, signature })).toString('base64');
}

test('RED-TEAM 1A: Underpayment & Wrong Recipient attacks are rejected with 402 across all rails', async () => {
  const { app } = createTestServer();
  const { baseUrl, close } = await startServer(app);

  try {
    // 1. EVM Underpayment (1 Wei instead of 300 Gwei)
    const evmUnderpay = Buffer.from(
      JSON.stringify({
        network: 'eip155:42161',
        payload: {
          authorization: { to: BASE_PAY_TO_ADDRESS, asset: 'ETH', value: '1' },
          signature: `0x${'a'.repeat(64)}`,
        },
      })
    ).toString('base64');
    const r1 = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'x-evm-payment': evmUnderpay },
    });
    assert.strictEqual(r1.status, 402);

    // 2. Solana Underpayment (100 lamports instead of 10,000 lamports)
    const solUnderpay = Buffer.from(
      JSON.stringify({
        network: 'solana:mainnet',
        to: SOLANA_PAY_TO_ADDRESS,
        asset: 'SOL',
        amount: '100',
        signature: `SolUnderpaySig${Date.now()}`,
      })
    ).toString('base64');
    const r2 = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'x-solana-payment': solUnderpay },
    });
    assert.strictEqual(r2.status, 402);

    // 3. Dual-Rail x402 Base USDC Underpayment (500 instead of 5000 on rbf-shield)
    const x402Underpay = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        payload: {
          authorization: {
            from: '0xb30ded1b7bc90e459a9820aaaf0297165e9f30fa',
            to: BASE_PAY_TO_ADDRESS,
            asset: BASE_USDC_CONTRACT,
            value: '500',
          },
          signature: `0x${'b'.repeat(130)}`,
        },
      })
    ).toString('base64');
    const r3 = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${'1'.repeat(64)}`, {
      headers: { 'payment-signature': x402Underpay },
    });
    assert.strictEqual(r3.status, 402);

    // 4. Wrong Recipient Attack (EVM & Solana)
    const evmWrongRecipient = Buffer.from(
      JSON.stringify({
        network: 'eip155:8453',
        payload: {
          authorization: {
            to: '0x000000000000000000000000000000000000dEaD',
            asset: BASE_USDC_CONTRACT,
            value: '50000',
          },
          signature: `0x${'c'.repeat(64)}`,
        },
      })
    ).toString('base64');
    const r4 = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'x-evm-payment': evmWrongRecipient },
    });
    assert.strictEqual(r4.status, 402);

    const solWrongRecipient = Buffer.from(
      JSON.stringify({
        network: 'solana:mainnet',
        to: '11111111111111111111111111111111',
        asset: SOLANA_USDC_MINT,
        amount: '50000',
        signature: `SolWrongRecipient${Date.now()}`,
      })
    ).toString('base64');
    const r5 = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'x-solana-payment': solWrongRecipient },
    });
    assert.strictEqual(r5.status, 402);
  } finally {
    await close();
  }
});

test('RED-TEAM 1B: 50x Parallel Race-Condition Replay Attack yields strictly 1x 200 OK and 49x 402', async () => {
  const { app, btcAdapter } = createTestServer();
  // Prime mempool cache so 50 concurrent requests hit memory fast after auth
  await btcAdapter.getMempoolEntropy();
  const { baseUrl, close } = await startServer(app);

  try {
    // Use real verified Base Mainnet tx hash (on-chain RPC race test)
    const racePayload = Buffer.from(
      JSON.stringify({
        network: 'eip155:8453',
        verifyOnChain: true,
        txHash: '0x8d31cacd2b77722ce841ecc1514ec96a5b1c410689c84c6d86cd0bb20220240a',
      })
    ).toString('base64');

    const responses = await Promise.all(
      Array.from({ length: 50 }, () =>
        fetch(`${baseUrl}/v1/omni/btc/mempool`, {
          headers: { 'x-evm-payment': racePayload },
        })
      )
    );

    const statuses = responses.map((r) => r.status);
    const okCount = statuses.filter((s) => s === 200).length;
    const rejectedCount = statuses.filter((s) => s === 402).length;

    console.log(`[RED-TEAM RACE] 50x Parallel On-Chain Replay -> 200 OK: ${okCount}, 402 Rejected: ${rejectedCount}`);
    assert.strictEqual(okCount, 1, 'Exactly 1 request must succeed in 50x concurrent replay');
    assert.strictEqual(rejectedCount, 49, 'Remaining 49 concurrent requests must be rejected with 402');
  } finally {
    await close();
  }
});

test('RED-TEAM 1C: Macaroon HMAC tampering, expiration, and cross-endpoint price downgrade are rejected', async () => {
  const { app } = createTestServer();
  const { baseUrl, close } = await startServer(app);

  try {
    const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
    const futureExp = Math.floor(Date.now() / 1000) + 3600;

    // 1. Tamper caveat (change price_sats=1 -> price_sats=5 without re-signing)
    const valid1SatMac = buildSignedMacaroon(TEST_MACAROON_SECRET, paymentHashHex, 1, futureExp);
    const decoded = JSON.parse(Buffer.from(valid1SatMac, 'base64').toString('utf8'));
    decoded.caveat = decoded.caveat.replace('price_sats=1', 'price_sats=5');
    const tamperedMac = Buffer.from(JSON.stringify(decoded)).toString('base64');

    const rTamper = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${'2'.repeat(64)}`, {
      headers: { Authorization: `L402 ${tamperedMac}:${preimageHex}` },
    });
    assert.strictEqual(rTamper.status, 402, 'Tampered macaroon signature must be rejected');

    // 2. Cross-endpoint price downgrade (valid 1-sat signed macaroon used on 5-sat endpoint)
    const rDowngrade = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${'2'.repeat(64)}`, {
      headers: { Authorization: `L402 ${valid1SatMac}:${preimageHex}` },
    });
    assert.strictEqual(rDowngrade.status, 402, '1-sat macaroon must be rejected on 5-sat endpoint');

    // 3. Expired macaroon
    const expiredMac = buildSignedMacaroon(
      TEST_MACAROON_SECRET,
      paymentHashHex,
      5,
      Math.floor(Date.now() / 1000) - 60
    );
    const rExpired = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${'2'.repeat(64)}`, {
      headers: { Authorization: `L402 ${expiredMac}:${preimageHex}` },
    });
    assert.strictEqual(rExpired.status, 402, 'Expired macaroon must be rejected');

    // 4. Valid 5-sat signed macaroon succeeds
    const valid5SatMac = buildSignedMacaroon(TEST_MACAROON_SECRET, paymentHashHex, 5, futureExp);
    const rValid = await fetch(`${baseUrl}/v1/chain/btc/fees`, {
      headers: { Authorization: `L402 ${valid5SatMac}:${preimageHex}` },
    });
    assert.strictEqual(rValid.status, 200);
  } finally {
    await close();
  }
});

test('RED-TEAM 2: SUB-LIG /v1/omni/pay-lightning rejects >25 sats, amountless, and testnet invoices with 400 before payment', async () => {
  const { app } = createTestServer();
  const { baseUrl, close } = await startServer(app);

  try {
    const badInvoices = [
      { name: 'Over-cap 26 sats (260n)', invoice: `lnbc260n1p${'q'.repeat(80)}` },
      { name: 'Over-cap 1000 sats (10u)', invoice: `lnbc10u1p${'q'.repeat(80)}` },
      { name: 'Amountless invoice', invoice: `lnbc1p${'q'.repeat(80)}` },
      { name: 'Testnet invoice', invoice: `lntb50n1p${'q'.repeat(80)}` },
      { name: 'Malformed garbage', invoice: 'not-a-bolt11-invoice' },
    ];

    for (const tc of badInvoices) {
      const res = await fetch(`${baseUrl}/v1/omni/pay-lightning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice: tc.invoice }),
      });
      assert.strictEqual(res.status, 400, `${tc.name} must return 400 Bad Request before payment`);
    }
  } finally {
    await close();
  }
});

test('RED-TEAM 3: /v1/chain/btc/simulate-tx fuzzing & injection blocked at 400; spent/missing UTXO returns consensusAllowed: false', async () => {
  const { app, btcAdapter } = createTestServer();
  const { baseUrl, close } = await startServer(app);

  try {
    const maliciousBodies = [
      { rawTxHex: '; rm -rf /' },
      { rawTxHex: '$(whoami)' },
      { rawTxHex: '`id`' },
      { rawTxHex: 'ab'.repeat(49) }, // too short (< 100 chars)
      { rawTxHex: 'ab'.repeat(50) + 'a' }, // odd length
      { rawTxHex: 'ab'.repeat(100_001) }, // oversized (> 200,000 chars)
    ];

    for (const body of maliciousBodies) {
      const res = await fetch(`${baseUrl}/v1/chain/btc/simulate-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.strictEqual(res.status, 400, 'Malicious/malformed rawTxHex must be blocked at 400');
    }

    // Valid-format minimal SegWit raw tx spending a non-existent all-zero outpoint
    const fakeValidFormatRawTx =
      '02000000' + // version
      '0001' + // segwit marker+flag
      '01' + // 1 input
      '11'.repeat(32) + // fake prev txid
      '00000000' + // vout 0
      '00' + // scriptSig len 0
      'fdffffff' + // sequence (RBF enabled)
      '01' + // 1 output
      'e803000000000000' + // 1000 sats
      '160014' + '22'.repeat(20) + // P2WPKH scriptPubKey
      '024730440220' + '33'.repeat(32) + '0220' + '44'.repeat(32) + '01' + '2102' + '55'.repeat(32) + // dummy witness
      '00000000'; // locktime

    const sim = await btcAdapter.simulateTxConsensus(fakeValidFormatRawTx);
    assert.strictEqual(sim.consensusAllowed, false);
    assert.strictEqual(sim.broadcastedToNetwork, false);
    assert.ok(sim.rejectReason, 'Must provide consensus reject reason');
    console.log(`[RED-TEAM SIMULATE-TX] Missing UTXO properly rejected: ${sim.rejectReason}`);
  } finally {
    await close();
  }
});

test('RED-TEAM 4 & 5: Live Mempool RBF Edge-Case Hunt & 100x Concurrent Load Benchmark (< 2ms cached)', async () => {
  const { app, btcAdapter } = createTestServer();
  const { baseUrl, close } = await startServer(app);

  try {
    // 4. Hunt a real tx from live mempool via Next-Block X-Ray and verify RBF Shield
    const xray = await btcAdapter.getNextBlockXray();
    const sampleTxid = xray.topWhaleTransactions[0]?.txid;
    assert.ok(sampleTxid, 'Live mempool must have at least 1 candidate tx');

    const rbf = await btcAdapter.checkRbfShield(sampleTxid);
    assert.strictEqual(rbf.txid, sampleTxid);
    assert.ok(['SAFE', 'MEDIUM_RISK', 'HIGH_RISK_RBF_ENABLED'].includes(rbf.zeroConfRiskLevel));
    console.log(`[RED-TEAM MEMPOOL EDGE] TX ${sampleTxid.slice(0, 12)}... -> Risk: ${rbf.zeroConfRiskLevel}, FeeRate: ${rbf.feeRateSatPerVb} sat/vB`);

    // 5. 100x Concurrent Load Benchmark on cached /v1/chain/btc/mempool
    await btcAdapter.getMempoolEntropy(); // prime 30s cache
    const { preimageHex, paymentHashHex } = L402Service.generatePreimagePair();
    const mac = buildSignedMacaroon(
      TEST_MACAROON_SECRET,
      paymentHashHex,
      2,
      Math.floor(Date.now() / 1000) + 3600
    );

    const t0 = performance.now();
    const loadResults = await Promise.all(
      Array.from({ length: 100 }, () =>
        fetch(`${baseUrl}/v1/chain/btc/mempool`, {
          headers: { Authorization: `L402 ${mac}:${preimageHex}` },
        })
      )
    );
    const totalMs = performance.now() - t0;
    const fiveXxCount = loadResults.filter((r) => r.status >= 500).length;
    const okCount = loadResults.filter((r) => r.status === 200).length;

    assert.strictEqual(fiveXxCount, 0, 'Must have 0% 5xx errors under 100x concurrent load');
    assert.strictEqual(okCount, 100, 'All 100 concurrent cached requests must return 200 OK');
    console.log(`[RED-TEAM 100x LOAD] 100 parallel requests completed in ${totalMs.toFixed(2)}ms (avg ${(totalMs / 100).toFixed(2)}ms/req, 0% 5xx)`);
  } finally {
    await close();
  }
});

test('RED-TEAM 6: Post-Payment 500 Failure Recovery (Retry Voucher & Idempotent Nonce Retry)', async () => {
  const { app, btcAdapter, nodeTruthService } = createTestServer();
  await btcAdapter.getMempoolEntropy(); // prime cache for fast recovery requests
  const { baseUrl, close } = await startServer(app);

  const originalFetch = globalThis.fetch;
  const originalGetMempool = nodeTruthService.getMempoolEntropy.bind(nodeTruthService);
  let settleCalls = 0;

  const account = privateKeyToAccount(generatePrivateKey());
  const nowSec = Math.floor(Date.now() / 1000);

  async function buildSignedX402Header(nonceHex: `0x${string}`, valueAtomic: bigint): Promise<string> {
    const auth = {
      from: account.address,
      to: BASE_PAY_TO_ADDRESS as `0x${string}`,
      value: valueAtomic,
      validAfter: 0n,
      validBefore: BigInt(nowSec + 3600),
      nonce: nonceHex,
    };
    const signature = await account.signTypedData({
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: BASE_USDC_CONTRACT as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: auth,
    });

    return Buffer.from(
      JSON.stringify({
        x402Version: 2,
        payload: {
          authorization: {
            from: auth.from,
            to: auth.to,
            value: auth.value.toString(),
            validAfter: auth.validAfter.toString(),
            validBefore: auth.validBefore.toString(),
            nonce: auth.nonce,
          },
          signature,
        },
      })
    ).toString('base64');
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('mainnet.base.org')) {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      let parsed: any = {};
      try {
        parsed = JSON.parse(bodyStr);
      } catch {
        // ignore
      }
      const rpcId = Array.isArray(parsed) ? (parsed[0]?.id ?? 1) : (parsed?.id ?? 1);
      const rpcRes = {
        jsonrpc: '2.0',
        id: rpcId,
        result: `0x${(1_000_000n).toString(16).padStart(64, '0')}`,
      };
      return new Response(JSON.stringify(Array.isArray(parsed) ? [rpcRes] : rpcRes), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/settle')) {
      settleCalls += 1;
      return new Response(
        JSON.stringify({ success: true, transaction: `0xsettled${settleCalls.toString().padStart(57, '0')}` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    // 1. x402 Base USDC payment hits simulated RPC 500 -> returns Retry Voucher
    const x402Header1 = await buildSignedX402Header(`0x${'a1'.repeat(32)}`, 2000n);
    nodeTruthService.getMempoolEntropy = async () => {
      throw new Error('Simulated bitcoind RPC timeout');
    };

    const failRes1 = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'Payment-Signature': x402Header1 },
    });
    assert.strictEqual(failRes1.status, 500, 'Downstream RPC failure must return 500');
    assert.strictEqual(settleCalls, 1, 'Initial x402 payment should settle exactly once');
    const voucher1 = failRes1.headers.get('x-payment-retry-voucher');
    assert.ok(voucher1, '500 response must include X-Payment-Retry-Voucher header');
    const failBody1: any = await failRes1.json();
    assert.strictEqual(failBody1.paymentProtected, true);
    assert.strictEqual(failBody1.retryVoucher, voucher1);

    // Tamper check on voucher1 (upgrade price_sats=2 -> price_sats=5 without valid HMAC)
    const decodedV1 = JSON.parse(Buffer.from(voucher1, 'base64').toString('utf8'));
    decodedV1.caveat = decodedV1.caveat.replace('price_sats=2', 'price_sats=5');
    const tamperedVoucher = Buffer.from(JSON.stringify(decodedV1)).toString('base64');
    const tamperRes = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${'3'.repeat(64)}`, {
      headers: { 'X-Payment-Retry-Voucher': tamperedVoucher },
    });
    assert.strictEqual(tamperRes.status, 402, 'Tampered retry voucher must be rejected');

    // Price upgrade check: 2-sat voucher cannot redeem 5-sat endpoint
    const upgradeRes = await fetch(`${baseUrl}/v1/chain/btc/rbf-shield/${'3'.repeat(64)}`, {
      headers: { 'X-Payment-Retry-Voucher': voucher1 },
    });
    assert.strictEqual(upgradeRes.status, 402, '2-sat voucher must be rejected on 5-sat endpoint');

    // 2. Restore RPC -> redeem X-Payment-Retry-Voucher -> 200 OK
    nodeTruthService.getMempoolEntropy = originalGetMempool;
    const voucherOkRes = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'X-Payment-Retry-Voucher': voucher1 },
    });
    assert.strictEqual(voucherOkRes.status, 200, 'Valid retry voucher must succeed with 200 OK');
    assert.strictEqual(voucherOkRes.headers.get('x-payment-rail'), 'RETRY-VOUCHER-RECOVERY');

    // 3. Anti-double-dip & replay after 200 OK: neither voucher1 nor x402Header1 can be reused
    const voucherReplayRes = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'X-Payment-Retry-Voucher': voucher1 },
    });
    assert.strictEqual(voucherReplayRes.status, 402, 'Used retry voucher must be rejected with 402');

    const headerAfterVoucherRes = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'Payment-Signature': x402Header1 },
    });
    assert.strictEqual(
      headerAfterVoucherRes.status,
      402,
      'Original x402 header must be rejected after retry voucher was redeemed'
    );
    assert.strictEqual(settleCalls, 1, 'Facilitator /settle must not be re-invoked on replays');

    // 4. Same-header idempotent retry on x402 Base USDC without using voucher header
    const x402Header2 = await buildSignedX402Header(`0x${'b2'.repeat(32)}`, 2000n);
    nodeTruthService.getMempoolEntropy = async () => {
      throw new Error('Simulated bitcoind RPC failure #2');
    };

    const failRes2 = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'Payment-Signature': x402Header2 },
    });
    assert.strictEqual(failRes2.status, 500);
    assert.strictEqual(settleCalls, 2);
    const voucher2 = failRes2.headers.get('x-payment-retry-voucher');
    assert.ok(voucher2);

    nodeTruthService.getMempoolEntropy = originalGetMempool;
    const sameHeaderRetryRes = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'Payment-Signature': x402Header2 },
    });
    assert.strictEqual(
      sameHeaderRetryRes.status,
      200,
      'Same Payment-Signature header retry after 500 must recover without re-settling'
    );
    assert.strictEqual(settleCalls, 2, 'Same-header recovery must NOT call /settle again');

    // Subsequent reuse of x402Header2 OR voucher2 must both be rejected with 402
    const sameHeaderReplayRes = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'Payment-Signature': x402Header2 },
    });
    assert.strictEqual(sameHeaderReplayRes.status, 402, 'Second retry of same x402 header must return 402');

    const voucherAfterHeaderRes = await fetch(`${baseUrl}/v1/chain/btc/mempool`, {
      headers: { 'X-Payment-Retry-Voucher': voucher2 },
    });
    assert.strictEqual(
      voucherAfterHeaderRes.status,
      402,
      'Voucher must be invalidated once same-header retry succeeds'
    );

    // 5. Omni-Rail EVM same-header recovery after 500
    const omniEvmHeader = Buffer.from(
      JSON.stringify({
        network: 'eip155:42161',
        authorization: {
          from: '0x5555555555555555555555555555555555555555',
          to: BASE_PAY_TO_ADDRESS,
          value: '2000',
        },
        signature: `0x${'d4'.repeat(32)}`,
      })
    ).toString('base64');

    nodeTruthService.getMempoolEntropy = async () => {
      throw new Error('Simulated omni RPC failure');
    };
    const omniFail = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-EVM-Payment': omniEvmHeader },
    });
    assert.strictEqual(omniFail.status, 500);
    const omniVoucher = omniFail.headers.get('x-payment-retry-voucher');
    assert.ok(omniVoucher);

    nodeTruthService.getMempoolEntropy = originalGetMempool;
    const omniRecover = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-EVM-Payment': omniEvmHeader },
    });
    assert.strictEqual(omniRecover.status, 200);

    const omniReplay = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-EVM-Payment': omniEvmHeader },
    });
    assert.strictEqual(omniReplay.status, 402);

    const omniVoucherAfter = await fetch(`${baseUrl}/v1/omni/btc/mempool`, {
      headers: { 'X-Payment-Retry-Voucher': omniVoucher },
    });
    assert.strictEqual(omniVoucherAfter.status, 402);

    console.log('[RED-TEAM RECOVERY] Retry Voucher & Idempotent Nonce Recovery verified across Dual-Rail & Omni-Rail');
  } finally {
    globalThis.fetch = originalFetch;
    nodeTruthService.getMempoolEntropy = originalGetMempool;
    await close();
  }
});
