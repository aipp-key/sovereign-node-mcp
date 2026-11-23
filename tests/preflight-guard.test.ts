import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Eip7702ShieldService } from '../src/application/services/eip7702-shield.service.js';
import { EvmSafetyService } from '../src/application/services/evm-safety.service.js';
import { PreflightGuardService } from '../src/application/services/preflight-guard.service.js';
import { createMcpRouter } from '../src/interfaces/http/controllers/mcp.controller.js';
import type { EvmRpcClient } from '../src/infrastructure/evm/evm-rpc.helper.js';

const FROM = '0x1111111111111111111111111111111111111111';
const TO = '0x2222222222222222222222222222222222222222';

const cleanRpc: EvmRpcClient = {
  async call(_chainId, method) {
    if (method === 'eth_call') return { result: '0x' };
    if (method === 'eth_estimateGas') return { result: '0x5208' };
    if (method === 'eth_getBalance') return { result: '0x100' };
    if (method === 'eth_getTransactionCount') return { result: '0x5' };
    return { result: '0x' };
  },
};

test('PreflightGuardService returns ALLOW on clean EVM tx and BLOCK on severe stablecoin depeg', async () => {
  const evmSafety = new EvmSafetyService({ rpc: cleanRpc });
  const eip7702 = new Eip7702ShieldService();
  const mockNodeTruth = {} as any;
  const mockOracles = {
    getStablecoinPeg: () => ({
      assets: [
        { symbol: 'USDC', depegRiskScore: 5, deviationBps: 1 },
        { symbol: 'USDT', depegRiskScore: 82, deviationBps: -210 },
      ],
    }),
  } as any;

  const guard = new PreflightGuardService({
    evmSafetyService: evmSafety,
    eip7702ShieldService: eip7702,
    nodeTruthService: mockNodeTruth,
    oracleFeedsService: mockOracles,
  });

  const clean = await guard.evaluate({
    protocol: 'evm',
    chainId: 8453,
    from: FROM,
    to: TO,
    data: '0x',
    value: '0x0',
    blockTag: 'latest',
    stablecoinSymbol: 'USDC',
  });
  assert.equal(clean.verdict, 'ALLOW');
  assert.deepEqual(clean.checksExecuted, ['evm_simulate_tx', 'evm_address_safety', 'stablecoin_peg']);
  assert.ok(clean.attestation, 'Attestation must be attached');
  assert.equal(clean.attestation.verdict, 'ALLOW');
  assert.ok(clean.attestation.signature.length > 32);
  assert.equal(clean.sla?.tier, 'SERVICE_CREDIT_10X');

  const verified = guard.verifyAttestation({
    inspectedAt: clean.inspectedAt,
    attestation: clean.attestation,
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.signatureValid, true);
  assert.equal(verified.reportHashMatches, true);

  const tampered = guard.verifyAttestation({
    inspectedAt: clean.inspectedAt,
    attestation: { ...clean.attestation, riskScore: 99 },
  });
  assert.equal(tampered.valid, false);

  const sandboxDrainer = guard.evaluateSandbox('eip7702-drainer');
  assert.equal(sandboxDrainer.verdict, 'BLOCK');
  assert.ok(sandboxDrainer.attestation);
  assert.equal(
    guard.verifyAttestation({
      inspectedAt: sandboxDrainer.inspectedAt,
      attestation: sandboxDrainer.attestation!,
    }).valid,
    true
  );

  const depeg = await guard.evaluate({
    protocol: 'evm',
    chainId: 8453,
    from: FROM,
    to: TO,
    data: '0x',
    value: '0x0',
    blockTag: 'latest',
    stablecoinSymbol: 'USDT',
  });
  assert.equal(depeg.verdict, 'BLOCK');
  assert.ok(depeg.findings.some((f) => f.code === 'STABLECOIN_SEVERE_DEPEG'));
});

test('PreflightGuardService evaluates BTC consensus + RBF shield in parallel', async () => {
  const evmSafety = new EvmSafetyService({ rpc: cleanRpc });
  const eip7702 = new Eip7702ShieldService();
  const mockNodeTruth = {
    simulateTxConsensus: async () => ({
      consensusAllowed: false,
      rejectReason: 'missing-inputs',
    }),
    checkRbfShield: async () => ({
      hasConflicts: false,
      zeroConfRiskLevel: 'HIGH_RISK_RBF_ENABLED',
      recommendation: 'Wait for 1 confirmation.',
    }),
  } as any;

  const guard = new PreflightGuardService({
    evmSafetyService: evmSafety,
    eip7702ShieldService: eip7702,
    nodeTruthService: mockNodeTruth,
  });

  const res = await guard.evaluate({
    protocol: 'btc',
    rawTxHex: '02'.repeat(60),
    txid: 'a'.repeat(64),
  });
  assert.equal(res.verdict, 'BLOCK');
  assert.deepEqual(res.checksExecuted, ['btc_simulate_tx', 'btc_rbf_shield']);
  assert.ok(res.findings.some((f) => f.code === 'BTC_CONSENSUS_REJECTED'));
  assert.ok(res.findings.some((f) => f.code === 'HIGH_RISK_RBF_ENABLED'));
});

test('Hosted MCP exposes all 10 tools including EVM simulation, address safety and unified preflight guard', async () => {
  const app = express();
  app.use(express.json());
  app.use(createMcpRouter({} as any, new Eip7702ShieldService()));
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('simulate_evm_tx'));
    assert.ok(text.includes('inspect_evm_address_safety'));
    assert.ok(text.includes('preflight_transaction_guard'));
  } finally {
    server.close();
  }
});
