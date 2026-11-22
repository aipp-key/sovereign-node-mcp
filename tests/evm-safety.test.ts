import test from 'node:test';
import assert from 'node:assert/strict';
import { EvmSafetyService } from '../src/application/services/evm-safety.service.js';
import {
  analyzeCalldata,
  decodeRevertData,
  parseEip7702DelegationDesignator,
} from '../src/infrastructure/evm/evm-calldata.helper.js';
import type { EvmRpcClient } from '../src/infrastructure/evm/evm-rpc.helper.js';

const FROM = '0x1111111111111111111111111111111111111111';
const TO = '0x2222222222222222222222222222222222222222';
const SPENDER = '0x3333333333333333333333333333333333333333';

test('analyzeCalldata detects unlimited ERC-20 approve and setApprovalForAll', () => {
  const unlimitedApprove =
    '0x095ea7b3' +
    '0000000000000000000000003333333333333333333333333333333333333333' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  const res = analyzeCalldata(unlimitedApprove);
  assert.equal(res.selector, '0x095ea7b3');
  assert.equal(res.isApproval, true);
  assert.equal(res.isUnlimitedApproval, true);
  assert.equal(res.spender, SPENDER);

  const approveAll =
    '0xa22cb465' +
    '0000000000000000000000003333333333333333333333333333333333333333' +
    '0000000000000000000000000000000000000000000000000000000000000001';
  const allRes = analyzeCalldata(approveAll);
  assert.equal(allRes.isApproval, true);
  assert.equal(allRes.isUnlimitedApproval, true);
});

test('decodeRevertData decodes Solidity Error(string) and Panic(uint256)', () => {
  // Error("INSUFFICIENT_BALANCE")
  const msgHex = Buffer.from('INSUFFICIENT_BALANCE', 'utf8').toString('hex').padEnd(64, '0');
  const errData =
    '0x08c379a0' +
    '0000000000000000000000000000000000000000000000000000000000000020' +
    '0000000000000000000000000000000000000000000000000000000000000014' +
    msgHex;
  const decoded = decodeRevertData(errData);
  assert.equal(decoded.revertSelector, '0x08c379a0');
  assert.equal(decoded.revertReason, 'INSUFFICIENT_BALANCE');

  const panicData =
    '0x4e487b710000000000000000000000000000000000000000000000000000000000000011';
  const panic = decodeRevertData(panicData);
  assert.equal(panic.revertSelector, '0x4e487b71');
  assert.match(panic.revertReason ?? '', /overflow/i);
});

test('parseEip7702DelegationDesignator parses 23-byte 0xef0100 prefix', () => {
  const code = '0xef0100' + '4444444444444444444444444444444444444444';
  assert.equal(
    parseEip7702DelegationDesignator(code),
    '0x4444444444444444444444444444444444444444'
  );
  assert.equal(parseEip7702DelegationDesignator('0x6080604052'), null);
});

test('simulateTransaction returns BLOCK on revert and ALLOW on clean native transfer', async () => {
  const revertingRpc: EvmRpcClient = {
    async call(_chainId, method) {
      if (method === 'eth_call') {
        return {
          error: {
            code: 3,
            message: 'execution reverted',
            data: '0x4e487b710000000000000000000000000000000000000000000000000000000000000012',
          },
        };
      }
      if (method === 'eth_estimateGas') return { error: { code: 3, message: 'reverted' } };
      return { result: '0x60006000' };
    },
  };

  const svc = new EvmSafetyService({
    rpc: revertingRpc,
    scoreBytecode: async () => ({
      mlRiskScore: 10,
      mlVerdict: 'BENIGN_PATTERN',
      bytecodeSizeBytes: 4,
      inferenceMs: 1,
      modelVersion: 'test',
    }),
  });

  const blocked = await svc.simulateTransaction({
    chainId: 8453,
    from: FROM,
    to: TO,
    data: '0x',
    value: '0x0',
    blockTag: 'latest',
  });
  assert.equal(blocked.verdict, 'BLOCK');
  assert.equal(blocked.simulation.success, false);
  assert.match(blocked.simulation.revertReason ?? '', /zero/i);

  const cleanRpc: EvmRpcClient = {
    async call(_chainId, method) {
      if (method === 'eth_call') return { result: '0x' };
      if (method === 'eth_estimateGas') return { result: '0x5208' };
      return { result: '0x' };
    },
  };
  const cleanSvc = new EvmSafetyService({ rpc: cleanRpc });
  const allowed = await cleanSvc.simulateTransaction({
    chainId: 8453,
    from: FROM,
    to: TO,
    data: '0x',
    value: '1000000000000000',
    blockTag: 'latest',
  });
  assert.equal(allowed.verdict, 'ALLOW');
  assert.equal(allowed.simulation.gasEstimate, '21000');
  assert.equal(allowed.valueWei, '1000000000000000');
});

test('inspectAddressSafety flags SELFDESTRUCT and EIP-1967 proxy contracts', async () => {
  // PUSH4 mint(address,uint256) [40c10f19] + SELFDESTRUCT (ff)
  const riskyBytecode = '0x6340c10f19ff';
  const implSlot =
    '0x0000000000000000000000005555555555555555555555555555555555555555';

  const mockRpc: EvmRpcClient = {
    async call(_chainId, method) {
      if (method === 'eth_getCode') return { result: riskyBytecode };
      if (method === 'eth_getBalance') return { result: '0x0' };
      if (method === 'eth_getTransactionCount') return { result: '0x1' };
      if (method === 'eth_getStorageAt') return { result: implSlot };
      return { result: '0x' };
    },
  };

  const svc = new EvmSafetyService({
    rpc: mockRpc,
    scoreBytecode: async () => ({
      mlRiskScore: 88,
      mlVerdict: 'DRAINER_ML_DETECTED',
      bytecodeSizeBytes: 6,
      inferenceMs: 1,
      modelVersion: 'test',
    }),
  });

  const report = await svc.inspectAddressSafety({ chainId: 8453, address: TO });
  assert.equal(report.verdict, 'HIGH_RISK');
  assert.equal(report.accountType, 'PROXY_CONTRACT');
  assert.equal(
    report.proxyInfo?.implementationAddress,
    '0x5555555555555555555555555555555555555555'
  );
  assert.equal(report.bytecodeAnalysis.opcodes.selfdestruct, true);
  assert.ok(report.findings.some((f) => f.code === 'OPCODE_SELFDESTRUCT'));
  assert.ok(report.findings.some((f) => f.code === 'ML_DRAINER_BYTECODE'));
});
