/**
 * Lightweight background collector for real Bitcoin Core v31.1 mempool & fee telemetry.
 * Appends 1 compact JSONL snapshot per minute to data/mempool-history.jsonl for future ML training.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BitcoinRpcAdapter } from '../dist/infrastructure/bitcoin/bitcoin-rpc.adapter.js';

const INTERVAL_MS = Number(process.env.COLLECTOR_INTERVAL_MS || 60_000);
const OUT_FILE = process.env.COLLECTOR_OUT_FILE || path.resolve(process.cwd(), 'data', 'mempool-history.jsonl');

async function collectOnce(rpc) {
  const [entropy, fees, block] = await Promise.all([
    rpc.getMempoolEntropy(),
    rpc.getSmartFeeEstimates(),
    rpc.getLatestBlockHeader(),
  ]);

  const record = {
    ts: Date.now(),
    height: block.height,
    blockTime: block.timestamp,
    txCount: entropy.txCount,
    vsizeBytes: entropy.vsizeBytes,
    totalFeeSats: entropy.totalFeeSats,
    minFee: entropy.minFeeRateSatPerVb,
    medFee: entropy.medianFeeRateSatPerVb,
    fastFee: entropy.fastestFeeRateSatPerVb,
    est1to2: fees.fastestSatPerVb,
    est3: fees.halfHourSatPerVb,
    est6: fees.economicSatPerVb,
    congestion: entropy.congestionLevel,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.appendFileSync(OUT_FILE, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

async function main() {
  const rpc = new BitcoinRpcAdapter({
    tailscaleHost: process.env.TAILSCALE_HOST || '127.0.0.1',
    containerName: 'sovereign-bitcoind',
  });

  console.log(`[BTC Collector] Writing snapshots every ${INTERVAL_MS}ms -> ${OUT_FILE}`);
  const run = async () => {
    try {
      const rec = await collectOnce(rpc);
      console.log(`[BTC Collector] height=${rec.height} tx=${rec.txCount} fast=${rec.est1to2} sat/vB`);
    } catch (err) {
      console.error('[BTC Collector] Error:', err.message);
    }
  };

  await run();
  if (!process.argv.includes('--once')) {
    setInterval(run, INTERVAL_MS);
  }
}

main();
