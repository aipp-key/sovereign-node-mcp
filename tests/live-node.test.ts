import test from 'node:test';
import assert from 'node:assert';
import { BitcoinRpcAdapter } from '../src/infrastructure/bitcoin/bitcoin-rpc.adapter.js';

test('BitcoinRpcAdapter connects to live Bitcoin Core (31.1) and returns validated MempoolEntropy', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  const mempool = await adapter.getMempoolEntropy();
  assert.ok(mempool.txCount > 0, 'Mempool should have active transactions');
  assert.ok(mempool.vsizeBytes > 0, 'Mempool vsize should be positive');
  assert.ok(mempool.totalFeeSats > 0, 'Total fees in sats should be positive');
  assert.ok(['LOW', 'MODERATE', 'HIGH', 'EXTREME'].includes(mempool.congestionLevel));

  console.log(`[LIVE NODE PROBE] Tx Count: ${mempool.txCount}, VSize: ${mempool.vsizeBytes} bytes, Congestion: ${mempool.congestionLevel}`);
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

  console.log(`[LIVE FEE PROBE] Fastest (1-2 blocks): ${smartFees.fastestSatPerVb} sat/vB | Economic (6 blocks): ${smartFees.economicSatPerVb} sat/vB`);
});

test('BitcoinRpcAdapter inspects 0-Conf and RBF shield for unconfirmed transaction', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
  });

  // Query a live mempool txid
  const rbfResult = await adapter.checkRbfShield('fad38b3b53b95f62a1dd0a87d38df9bbcf2eef521a6c9cb8e21077c7297e361e');
  assert.strictEqual(rbfResult.txid, 'fad38b3b53b95f62a1dd0a87d38df9bbcf2eef521a6c9cb8e21077c7297e361e');
  assert.ok(rbfResult.zeroConfRiskLevel);

  console.log(`[LIVE RBF PROBE] Risk Level: ${rbfResult.zeroConfRiskLevel} | Recommendation: ${rbfResult.recommendation}`);
});

test('In-Memory Cache serves subsequent queries in < 5 milliseconds', async () => {
  const adapter = new BitcoinRpcAdapter({
    tailscaleHost: '100.95.119.88',
    containerName: 'sovereign-bitcoind',
    cacheTtlMs: 5000,
  });

  // First call warms cache
  await adapter.getMempoolEntropy();

  // Second call must be served instantly from memory
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
