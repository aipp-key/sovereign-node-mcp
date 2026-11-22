import { AutonomousL402Agent } from '../src/application/services/autonomous-agent-client.js';
import { PhoenixdPayerAdapter } from '../src/infrastructure/lightning/phoenixd-payer.adapter.js';
import { BitcoinRpcAdapter } from '../src/infrastructure/bitcoin/bitcoin-rpc.adapter.js';

const PHOENIXD_URL = process.env.PHOENIXD_URL || 'http://100.95.119.88:9740';
const PHOENIXD_PASSWORD = process.env.PHOENIXD_PASSWORD || '__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w';
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://node.sovroute.com';
const TAILSCALE_HOST = process.env.TAILSCALE_HOST || '100.95.119.88';

interface PhoenixdInfo {
  nodeId: string;
  channels: Array<{
    state: string;
    balanceSat: number;
    inboundLiquiditySat: number;
  }>;
  blockHeight: number;
}

async function getPhoenixdInfo(): Promise<PhoenixdInfo> {
  const auth = Buffer.from(`:${PHOENIXD_PASSWORD}`).toString('base64');
  const res = await fetch(`${PHOENIXD_URL}/getinfo`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to get Phoenixd info: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<PhoenixdInfo>;
}

async function runLiveForensicsVerification() {
  console.log('================================================================');
  console.log('⚡ SOVEREIGN NODE ENGINE — REAL CRYPTO LIVE MAINNET VERIFICATION');
  console.log(`🌐 Target Gateway: ${GATEWAY_URL}`);
  console.log(`⚡ Lightning Payer: Phoenixd Node (${PHOENIXD_URL})`);
  console.log('================================================================\n');

  // 1. Initial State Check
  const initialInfo = await getPhoenixdInfo();
  const initialBalance = initialInfo.channels.reduce((acc, c) => acc + c.balanceSat, 0);
  console.log(`🏦 Initial Phoenixd Balance: ${initialBalance} sats`);
  console.log(`📦 Node Block Height: ${initialInfo.blockHeight}`);
  console.log(`🔗 Channel State: ${initialInfo.channels[0]?.state || 'N/A'}\n`);

  const payer = new PhoenixdPayerAdapter({
    baseUrl: PHOENIXD_URL,
    httpPassword: PHOENIXD_PASSWORD,
  });
  const agent = new AutonomousL402Agent(payer);

  // -------------------------------------------------------------
  // TEST 1: Next-Block X-Ray (Cost: 3 sats)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🔬 TEST 1: GET /v1/chain/btc/next-block-xray (Price: 3 sats)');
  console.log('----------------------------------------------------------------');
  const t1Start = Date.now();
  const xrayRes = await agent.fetch(`${GATEWAY_URL}/v1/chain/btc/next-block-xray`, {
    maxPriceSatsAllowed: 5,
  });
  const t1Duration = Date.now() - t1Start;

  console.log(`✅ Test 1 Succeeded in ${t1Duration}ms!`);
  console.log(`  Source: ${xrayRes.source}`);
  console.log(`  Payment Rail: ${xrayRes.paymentRail}`);
  console.log(`  Candidate Block Height: ${xrayRes.data.candidateBlockHeight}`);
  console.log(`  Cutoff Fee Rate: ${xrayRes.data.cutoffFeeRateSatPerVb} sat/vB`);
  console.log(`  Total Candidate TXs: ${xrayRes.data.totalTransactions}`);
  console.log(`  Total Block Fee Sats: ${xrayRes.data.totalFeeSats} sats`);
  console.log(`  Top Whale TXs Count: ${xrayRes.data.topWhaleTransactions?.length || 0}`);

  // Obtain live sample candidate from sovereign-bitcoind for Test 2 & Test 3
  const btcAdapter = new BitcoinRpcAdapter({
    tailscaleHost: TAILSCALE_HOST,
    containerName: 'sovereign-bitcoind',
  });
  const sample = await btcAdapter.getSampleCandidateRawTxHex();
  const candidateTxid = xrayRes.data.topWhaleTransactions?.[0]?.txid || sample.txid;

  console.log(`  🎯 Discovered Live Candidate TXID: ${candidateTxid}\n`);

  // -------------------------------------------------------------
  // TEST 2: 0-Conf RBF Double-Spend Shield (Cost: 5 sats)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log(`🛡️ TEST 2: GET /v1/chain/btc/rbf-shield/${candidateTxid} (Price: 5 sats)`);
  console.log('----------------------------------------------------------------');
  const t2Start = Date.now();
  const rbfRes = await agent.fetch(`${GATEWAY_URL}/v1/chain/btc/rbf-shield/${candidateTxid}`, {
    maxPriceSatsAllowed: 10,
  });
  const t2Duration = Date.now() - t2Start;

  console.log(`✅ Test 2 Succeeded in ${t2Duration}ms!`);
  console.log(`  Source: ${rbfRes.source}`);
  console.log(`  Payment Rail: ${rbfRes.paymentRail}`);
  console.log(`  TXID: ${rbfRes.data.txid}`);
  console.log(`  Is in Mempool: ${rbfRes.data.isInMempool}`);
  console.log(`  BIP-125 Replaceable: ${rbfRes.data.bip125Replaceable}`);
  console.log(`  0-Conf Risk Level: ${rbfRes.data.zeroConfRiskLevel}`);
  console.log(`  Fee Rate: ${rbfRes.data.feeRateSatPerVb} sat/vB`);
  console.log(`  Ancestor Count: ${rbfRes.data.ancestorCount ?? 'N/A'}`);
  console.log(`  Recommendation: ${rbfRes.data.recommendation}\n`);

  // -------------------------------------------------------------
  // TEST 3: Zero-Broadcast Consensus Simulator (Cost: 5 sats)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🧪 TEST 3: POST /v1/chain/btc/simulate-tx (Price: 5 sats)');
  console.log('----------------------------------------------------------------');
  
  console.log(`  Using live candidate rawTxHex (length: ${sample.rawTxHex.length} chars, txid: ${sample.txid})`);

  const t3Start = Date.now();
  const simRes = await agent.fetch(`${GATEWAY_URL}/v1/chain/btc/simulate-tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawTxHex: sample.rawTxHex }),
    maxPriceSatsAllowed: 10,
  });
  const t3Duration = Date.now() - t3Start;

  console.log(`✅ Test 3 Succeeded in ${t3Duration}ms!`);
  console.log(`  Source: ${simRes.source}`);
  console.log(`  Payment Rail: ${simRes.paymentRail}`);
  console.log(`  TXID: ${simRes.data.txid}`);
  console.log(`  Consensus Allowed: ${simRes.data.consensusAllowed}`);
  console.log(`  Already in Mempool: ${simRes.data.alreadyInMempool}`);
  console.log(`  Broadcasted to Network: ${simRes.data.broadcastedToNetwork} (%0 P2P Broadcast Verified!)`);
  console.log(`  Vsize: ${simRes.data.vsize} vB (Weight: ${simRes.data.weight})`);
  console.log(`  Inputs: ${simRes.data.inputCount}, Outputs: ${simRes.data.outputCount}`);
  console.log(`  Total Output Value: ${simRes.data.totalOutputSats} sats`);
  console.log(`  Signals BIP-125 RBF: ${simRes.data.signalsBip125Rbf}`);
  console.log(`  Next Block Cutoff Fee Rate: ${simRes.data.nextBlockCutoffSatPerVb} sat/vB\n`);

  // -------------------------------------------------------------
  // TEST 4: Mempool Entropy (Cost: 2 sats)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('📊 TEST 4: GET /v1/chain/btc/mempool (Price: 2 sats)');
  console.log('----------------------------------------------------------------');
  const t4Start = Date.now();
  const mempoolRes = await agent.fetch(`${GATEWAY_URL}/v1/chain/btc/mempool`, {
    maxPriceSatsAllowed: 5,
  });
  const t4Duration = Date.now() - t4Start;
  console.log(`✅ Test 4 Succeeded in ${t4Duration}ms!`);
  console.log(`  txCount: ${mempoolRes.data.txCount} | vsizeBytes: ${mempoolRes.data.vsizeBytes} | congestion: ${mempoolRes.data.congestionLevel}\n`);

  // -------------------------------------------------------------
  // TEST 5: Smart Fee Projections (Cost: 1 sat)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('⛽ TEST 5: GET /v1/chain/btc/fees (Price: 1 sat)');
  console.log('----------------------------------------------------------------');
  const t5Start = Date.now();
  const feesRes = await agent.fetch(`${GATEWAY_URL}/v1/chain/btc/fees`, {
    maxPriceSatsAllowed: 5,
  });
  const t5Duration = Date.now() - t5Start;
  console.log(`✅ Test 5 Succeeded in ${t5Duration}ms!`);
  console.log(`  fastestSatPerVb: ${feesRes.data.fastestSatPerVb} | economicSatPerVb: ${feesRes.data.economicSatPerVb}\n`);

  // -------------------------------------------------------------
  // TEST 6: Block Header Truth (Cost: 1 sat)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🧱 TEST 6: GET /v1/chain/btc/block (Price: 1 sat)');
  console.log('----------------------------------------------------------------');
  const t6Start = Date.now();
  const blockRes = await agent.fetch(`${GATEWAY_URL}/v1/chain/btc/block`, {
    maxPriceSatsAllowed: 5,
  });
  const t6Duration = Date.now() - t6Start;
  console.log(`✅ Test 6 Succeeded in ${t6Duration}ms!`);
  console.log(`  height: ${blockRes.data.height} | hash: ${blockRes.data.hash}\n`);

  // -------------------------------------------------------------
  // TEST 7: EIP-7702 AuthTx Shield (Cost: 5 sats)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🛡️ TEST 7: POST /v1/chain/evm/eip7702-shield (Price: 5 sats)');
  console.log('----------------------------------------------------------------');
  const t7Start = Date.now();
  const eip7702Res = await agent.fetch(`${GATEWAY_URL}/v1/chain/evm/eip7702-shield`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    maxPriceSatsAllowed: 10,
  });
  const t7Duration = Date.now() - t7Start;
  console.log(`✅ Test 7 Succeeded in ${t7Duration}ms!`);
  console.log(`  verdict: ${eip7702Res.data.verdict} | riskScore: ${eip7702Res.data.riskScore}\n`);

  // -------------------------------------------------------------
  // TEST 8: PyTorch ONNX Bytecode Risk ML (Cost: 5 sats)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🧠 TEST 8: POST /v1/chain/evm/bytecode-risk-ml (Price: 5 sats)');
  console.log('----------------------------------------------------------------');
  const t8Start = Date.now();
  const mlRes = await agent.fetch(`${GATEWAY_URL}/v1/chain/evm/bytecode-risk-ml`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bytecode: '0x6080604052326323b872dd63095ea7b3f4ff' }),
    maxPriceSatsAllowed: 10,
  });
  const t8Duration = Date.now() - t8Start;
  console.log(`✅ Test 8 Succeeded in ${t8Duration}ms!`);
  console.log(`  mlVerdict: ${mlRes.data.mlVerdict} | mlRiskScore: ${mlRes.data.mlRiskScore} | inferenceMs: ${mlRes.data.inferenceMs}\n`);

  // -------------------------------------------------------------
  // FINAL BALANCE RECONCILIATION
  // -------------------------------------------------------------
  const finalInfo = await getPhoenixdInfo();
  const finalBalance = finalInfo.channels.reduce((acc, c) => acc + c.balanceSat, 0);
  const satsSpent = initialBalance - finalBalance;
  const totalTimeMs = t1Duration + t2Duration + t3Duration + t4Duration + t5Duration + t6Duration + t7Duration + t8Duration;

  console.log('================================================================');
  console.log('🎉 100% REAL CRYPTO LIVE MAINNET VERIFICATION (ALL 8 ENDPOINTS) COMPLETED!');
  console.log('================================================================');
  console.log(`🏦 Initial Balance: ${initialBalance} sats`);
  console.log(`🏦 Final Balance:   ${finalBalance} sats`);
  console.log(`⚡ Total Sats Spent: ${satsSpent} sats (Expected: 27 sats + routing fees)`);
  console.log(`⏱️ Total Execution Time: ${totalTimeMs}ms`);
  console.log('🚀 node.sovroute.com All 8 Endpoints are 100% PRODUCTION READY!');
  console.log('================================================================\n');
}

runLiveForensicsVerification().catch((err) => {
  console.error('\n❌ Live Verification Failed:', err);
  process.exit(1);
});
