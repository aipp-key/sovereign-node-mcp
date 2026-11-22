import {
  EvmAddressSafetyReport,
  EvmAddressSafetyRequest,
  EvmSimulateTxReport,
  EvmSimulateTxRequest,
  SafetyFinding,
} from '../../domain/schemas/evm-safety.schema.js';
import { disassembleEvmBytecode } from '../../infrastructure/evm/eip7702-scanner.adapter.js';
import {
  analyzeCalldata,
  decodeAbiAddress,
  decodeAbiString,
  decodeRevertData,
  extractTokenRiskSelectors,
  parseEip7702DelegationDesignator,
} from '../../infrastructure/evm/evm-calldata.helper.js';
import {
  defaultEvmRpcClient,
  EvmRpcClient,
  extractRevertDataHex,
  toDecimalWei,
  toHexQuantity,
} from '../../infrastructure/evm/evm-rpc.helper.js';
import { EvmMlRiskResult, EvmOnnxRiskAdapter } from '../../infrastructure/ml/evm-onnx-risk.adapter.js';

// EIP-1967 implementation slot: bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

export interface EvmSafetyServiceDeps {
  rpc?: EvmRpcClient;
  scoreBytecode?: (bytecode: string) => Promise<EvmMlRiskResult>;
}

export class EvmSafetyService {
  private readonly rpc: EvmRpcClient;
  private readonly scoreBytecodeFn: (bytecode: string) => Promise<EvmMlRiskResult>;

  constructor(deps: EvmSafetyServiceDeps = {}) {
    this.rpc = deps.rpc ?? defaultEvmRpcClient;
    const onnx = deps.scoreBytecode ? null : new EvmOnnxRiskAdapter();
    this.scoreBytecodeFn = deps.scoreBytecode ?? ((code) => onnx!.scoreBytecode(code));
  }

  async simulateTransaction(req: EvmSimulateTxRequest): Promise<EvmSimulateTxReport> {
    const from = req.from.toLowerCase();
    const to = req.to.toLowerCase();
    const valueHex = toHexQuantity(req.value);
    const valueWei = toDecimalWei(req.value);
    const txObj = { from, to, data: req.data, value: valueHex };

    const [callRes, gasRes, codeRes] = await Promise.all([
      this.rpc.call(req.chainId, 'eth_call', [txObj, req.blockTag]),
      this.rpc.call(req.chainId, 'eth_estimateGas', [txObj]),
      this.rpc.call(req.chainId, 'eth_getCode', [to, 'latest']),
    ]);

    const findings: SafetyFinding[] = [];
    let riskScore = 5;

    const success = !callRes.error && typeof callRes.result === 'string';
    let revertReason: string | null = null;
    let revertSelector: string | null = null;
    if (!success) {
      const decoded = decodeRevertData(extractRevertDataHex(callRes.error), callRes.error?.message);
      revertReason = decoded.revertReason;
      revertSelector = decoded.revertSelector;
      riskScore += 45;
      findings.push({
        code: 'SIMULATION_REVERTED',
        severity: 'CRITICAL',
        message: `Pre-flight eth_call reverted: ${revertReason}`,
      });
    }

    const gasEstimate =
      !gasRes.error && typeof gasRes.result === 'string' ? BigInt(gasRes.result).toString(10) : null;
    const returnDataPreview =
      typeof callRes.result === 'string' ? callRes.result.slice(0, 138) : '0x';

    const calldataAnalysis = analyzeCalldata(req.data);
    if (calldataAnalysis.isUnlimitedApproval) {
      riskScore += 35;
      findings.push({
        code: 'UNLIMITED_TOKEN_APPROVAL',
        severity: 'WARN',
        message: `Calldata grants unlimited approval (${calldataAnalysis.action}) to ${calldataAnalysis.spender}.`,
      });
    } else if (calldataAnalysis.isApproval) {
      riskScore += 10;
      findings.push({
        code: 'TOKEN_APPROVAL_GRANTED',
        severity: 'INFO',
        message: `Calldata approves spender ${calldataAnalysis.spender} (${calldataAnalysis.action}).`,
      });
    }

    const targetCode = typeof codeRes.result === 'string' ? codeRes.result : '0x';
    const delegatedTarget = parseEip7702DelegationDesignator(targetCode);
    const isEip7702Delegated = delegatedTarget !== null;
    const isContract = targetCode !== '0x' && targetCode.length > 2 && !isEip7702Delegated;

    if (isEip7702Delegated) {
      riskScore += 20;
      findings.push({
        code: 'TARGET_EIP7702_DELEGATED_EOA',
        severity: 'WARN',
        message: `Target address is an EIP-7702 delegated EOA pointing to ${delegatedTarget}.`,
      });
    }

    if (!isContract && !isEip7702Delegated && req.data.length > 2) {
      riskScore += 15;
      findings.push({
        code: 'CALLDATA_TO_EOA',
        severity: 'WARN',
        message: 'Transaction sends non-empty calldata to an externally owned account (no contract code).',
      });
    }

    let bytecodeSizeBytes = 0;
    let mlRiskScore: number | null = null;
    let mlVerdict: string | null = null;

    if (isContract) {
      const disasm = disassembleEvmBytecode(targetCode);
      bytecodeSizeBytes = disasm.bytecodeSizeBytes;
      if (disasm.opcodes.selfdestruct) {
        riskScore += 25;
        findings.push({
          code: 'TARGET_HAS_SELFDESTRUCT',
          severity: 'CRITICAL',
          message: 'Target contract bytecode contains SELFDESTRUCT opcode.',
        });
      }
      try {
        const ml = await this.scoreBytecodeFn(targetCode);
        mlRiskScore = ml.mlRiskScore;
        mlVerdict = ml.mlVerdict;
        if (ml.mlVerdict === 'DRAINER_ML_DETECTED') {
          riskScore += 45;
          findings.push({
            code: 'ML_DRAINER_TARGET',
            severity: 'CRITICAL',
            message: `ONNX bytecode classifier flagged target as drainer (score=${ml.mlRiskScore}).`,
          });
        } else if (ml.mlVerdict === 'SUSPICIOUS_ML') {
          riskScore += 20;
          findings.push({
            code: 'ML_SUSPICIOUS_TARGET',
            severity: 'WARN',
            message: `ONNX bytecode classifier flagged target as suspicious (score=${ml.mlRiskScore}).`,
          });
        }
      } catch {
        // Non-fatal: deterministic simulation and calldata checks still apply.
      }
    }

    const boundedScore = Math.min(100, riskScore);
    const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
    const verdict = hasCritical || boundedScore >= 70 ? 'BLOCK' : boundedScore >= 30 ? 'WARN' : 'ALLOW';

    return {
      verdict,
      riskScore: boundedScore,
      chainId: req.chainId,
      from,
      to,
      valueWei,
      simulation: { success, revertReason, revertSelector, gasEstimate, returnDataPreview },
      calldataAnalysis,
      targetInspection: {
        isContract,
        isEip7702Delegated,
        delegatedTarget,
        bytecodeSizeBytes,
        mlRiskScore,
        mlVerdict,
      },
      findings,
      summary:
        verdict === 'BLOCK'
          ? 'BLOCK: Pre-flight simulation or target forensics detected critical execution/security risk.'
          : verdict === 'WARN'
            ? 'WARN: Simulation completed with elevated risk signals; review findings before signing.'
            : 'ALLOW: Pre-flight simulation succeeded with no critical risk signals.',
      inspectedAt: new Date().toISOString(),
    };
  }

  async inspectAddressSafety(req: EvmAddressSafetyRequest): Promise<EvmAddressSafetyReport> {
    const address = req.address.toLowerCase();
    const [codeRes, balRes, nonceRes, implSlotRes] = await Promise.all([
      this.rpc.call(req.chainId, 'eth_getCode', [address, 'latest']),
      this.rpc.call(req.chainId, 'eth_getBalance', [address, 'latest']),
      this.rpc.call(req.chainId, 'eth_getTransactionCount', [address, 'latest']),
      this.rpc.call(req.chainId, 'eth_getStorageAt', [address, EIP1967_IMPL_SLOT, 'latest']),
    ]);

    const code = typeof codeRes.result === 'string' ? codeRes.result : '0x';
    const balanceWei = typeof balRes.result === 'string' ? BigInt(balRes.result).toString(10) : '0';
    const nonce = typeof nonceRes.result === 'string' ? Number.parseInt(nonceRes.result, 16) : 0;
    const delegatedTarget = parseEip7702DelegationDesignator(code);
    const isContract = code !== '0x' && code.length > 2 && delegatedTarget === null;

    const findings: SafetyFinding[] = [];
    let riskScore = 5;

    if (delegatedTarget) {
      riskScore += 25;
      findings.push({
        code: 'EIP7702_DELEGATED_EOA',
        severity: 'WARN',
        message: `EOA has an active EIP-7702 delegation designator pointing to ${delegatedTarget}.`,
      });
    }

    if (!isContract && !delegatedTarget && nonce === 0 && balanceWei === '0') {
      riskScore += 15;
      findings.push({
        code: 'FRESH_ZERO_ACTIVITY_EOA',
        severity: 'INFO',
        message: 'Address has zero nonce, zero balance, and no deployed contract code.',
      });
    }

    const disasm = isContract
      ? disassembleEvmBytecode(code)
      : {
          bytecodeSizeBytes: 0,
          opcodes: { selfdestruct: false, delegatecall: false, create: false, create2: false },
          drainSelectors: [],
        };
    const tokenRiskSelectors = isContract ? extractTokenRiskSelectors(code) : [];

    const implAddr = decodeAbiAddress(typeof implSlotRes.result === 'string' ? implSlotRes.result : undefined);
    const proxyInfo = isContract ? { isProxy: implAddr !== null || disasm.opcodes.delegatecall, implementationAddress: implAddr } : null;

    if (proxyInfo?.isProxy) {
      riskScore += 15;
      findings.push({
        code: 'UPGRADEABLE_PROXY_DETECTED',
        severity: 'WARN',
        message: implAddr
          ? `EIP-1967 upgradeable proxy detected (implementation: ${implAddr}).`
          : 'Contract contains DELEGATECALL opcode (potential proxy or library delegation).',
      });
    }

    let tokenInfo: EvmAddressSafetyReport['tokenInfo'] = null;
    if (isContract) {
      const [symRes, decRes, supplyRes, ownerRes] = await Promise.all([
        this.rpc.call(req.chainId, 'eth_call', [{ to: address, data: '0x95d89b41' }, 'latest']),
        this.rpc.call(req.chainId, 'eth_call', [{ to: address, data: '0x313ce567' }, 'latest']),
        this.rpc.call(req.chainId, 'eth_call', [{ to: address, data: '0x18160ddd' }, 'latest']),
        this.rpc.call(req.chainId, 'eth_call', [{ to: address, data: '0x8da5cb5b' }, 'latest']),
      ]);

      const symbol = decodeAbiString(typeof symRes.result === 'string' ? symRes.result : undefined);
      const decimals =
        typeof decRes.result === 'string' && decRes.result.length === 66
          ? Number(BigInt(decRes.result))
          : null;
      const totalSupplyRaw =
        typeof supplyRes.result === 'string' && supplyRes.result.length === 66
          ? BigInt(supplyRes.result).toString(10)
          : null;
      const owner = decodeAbiAddress(typeof ownerRes.result === 'string' ? ownerRes.result : undefined);
      const isErc20 = Boolean(symbol && totalSupplyRaw !== null && decimals !== null && decimals <= 36);

      if (isErc20) {
        tokenInfo = { isErc20: true, symbol, decimals, totalSupplyRaw, owner };
        if (owner && tokenRiskSelectors.some((s) => s.startsWith('mint') || s.startsWith('blacklist') || s.startsWith('pause'))) {
          riskScore += 20;
          findings.push({
            code: 'PRIVILEGED_TOKEN_CONTROLS',
            severity: 'WARN',
            message: `Token (${symbol}) has active owner (${owner}) with privileged mint/pause/blacklist selectors.`,
          });
        }
      }
    }

    if (disasm.opcodes.selfdestruct) {
      riskScore += 35;
      findings.push({
        code: 'OPCODE_SELFDESTRUCT',
        severity: 'CRITICAL',
        message: 'Contract bytecode contains SELFDESTRUCT (0xff) opcode.',
      });
    }

    let mlRiskScore: number | null = null;
    let mlVerdict: string | null = null;
    if (isContract) {
      try {
        const ml = await this.scoreBytecodeFn(code);
        mlRiskScore = ml.mlRiskScore;
        mlVerdict = ml.mlVerdict;
        if (ml.mlVerdict === 'DRAINER_ML_DETECTED') {
          riskScore += 45;
          findings.push({
            code: 'ML_DRAINER_BYTECODE',
            severity: 'CRITICAL',
            message: `ONNX neural classifier flagged bytecode as drainer pattern (score=${ml.mlRiskScore}).`,
          });
        } else if (ml.mlVerdict === 'SUSPICIOUS_ML') {
          riskScore += 20;
          findings.push({
            code: 'ML_SUSPICIOUS_BYTECODE',
            severity: 'WARN',
            message: `ONNX neural classifier flagged bytecode as suspicious (score=${ml.mlRiskScore}).`,
          });
        }
      } catch {
        // Non-fatal fallback to deterministic analysis.
      }
    }

    const boundedScore = Math.min(100, riskScore);
    const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
    const verdict = hasCritical || boundedScore >= 65 ? 'HIGH_RISK' : boundedScore >= 25 ? 'CAUTION' : 'SAFE';

    const accountType: EvmAddressSafetyReport['accountType'] = delegatedTarget
      ? 'EIP7702_DELEGATED_EOA'
      : !isContract
        ? 'EOA'
        : tokenInfo?.isErc20
          ? 'ERC20_TOKEN'
          : proxyInfo?.isProxy
            ? 'PROXY_CONTRACT'
            : 'CONTRACT';

    return {
      verdict,
      riskScore: boundedScore,
      chainId: req.chainId,
      address,
      accountType,
      balanceWei,
      nonce,
      delegatedTarget,
      proxyInfo,
      tokenInfo,
      bytecodeAnalysis: {
        bytecodeSizeBytes: disasm.bytecodeSizeBytes,
        opcodes: disasm.opcodes,
        drainSelectors: disasm.drainSelectors,
        tokenRiskSelectors,
        mlRiskScore,
        mlVerdict,
      },
      findings,
      summary:
        verdict === 'HIGH_RISK'
          ? 'HIGH_RISK: Critical bytecode or drainer indicators detected on target address.'
          : verdict === 'CAUTION'
            ? 'CAUTION: Elevated control, proxy, or delegation signals detected.'
            : 'SAFE: No critical contract or drainer risk signals detected.',
      inspectedAt: new Date().toISOString(),
    };
  }
}
