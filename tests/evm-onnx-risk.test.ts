import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EvmOnnxRiskAdapter } from '../src/infrastructure/ml/evm-onnx-risk.adapter.js';

test('EvmOnnxRiskAdapter scores real audited contract bytecode as BENIGN_PATTERN', async () => {
  const cachePath = path.resolve(process.cwd(), 'scripts', 'ml', 'cache', 'clean_bytecodes.json');
  const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const metamask = cached.find((c: any) => c.label.includes('MetaMask'));
  assert.ok(metamask, 'MetaMask EIP-7702 Delegator bytecode cached');

  const adapter = new EvmOnnxRiskAdapter();
  const res = await adapter.scoreBytecode(metamask.bytecode);

  assert.equal(res.mlVerdict, 'BENIGN_PATTERN');
  assert.ok(res.mlRiskScore < 0.25, `Expected low risk score, got ${res.mlRiskScore}`);
  assert.ok(res.inferenceMs >= 0);
});

test('EvmOnnxRiskAdapter scores drainer bytecode (tx.origin + transferFrom + DELEGATECALL + SELFDESTRUCT) as DRAINER_ML_DETECTED', async () => {
  const adapter = new EvmOnnxRiskAdapter();
  const drainerHex = '0x6080604052326323b872dd63095ea7b3f4ff';
  const res = await adapter.scoreBytecode(drainerHex);

  assert.equal(res.mlVerdict, 'DRAINER_ML_DETECTED');
  assert.ok(res.mlRiskScore > 0.75, `Expected high risk score, got ${res.mlRiskScore}`);
});
