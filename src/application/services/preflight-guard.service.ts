import {
  BtcPreflightRequest,
  EvmPreflightRequest,
  GuardFinding,
  PreflightAttestationVerifyRequest,
  PreflightGuardReport,
  PreflightGuardRequest,
  PreflightGuardVerdict,
  PreflightSandboxScenario,
} from '../../domain/schemas/preflight-guard.schema.js';
import { Eip7702ShieldService } from './eip7702-shield.service.js';
import { EvmSafetyService } from './evm-safety.service.js';
import { NodeTruthService } from './node-truth.service.js';
import { OracleFeedsService } from './oracle-feeds.service.js';
import {
  attachPreflightAttestationAndSla,
  AttestationVerificationResult,
  buildPreflightSandboxReport,
  verifyPreflightAttestation,
} from './preflight-attestation.helper.js';

export interface PreflightGuardDeps {
  evmSafetyService: EvmSafetyService;
  eip7702ShieldService: Eip7702ShieldService;
  nodeTruthService: NodeTruthService;
  oracleFeedsService?: OracleFeedsService;
}

export class PreflightGuardService {
  private readonly evmSafety: EvmSafetyService;
  private readonly eip7702: Eip7702ShieldService;
  private readonly nodeTruth: NodeTruthService;
  private readonly oracles?: OracleFeedsService;

  constructor(deps: PreflightGuardDeps) {
    this.evmSafety = deps.evmSafetyService;
    this.eip7702 = deps.eip7702ShieldService;
    this.nodeTruth = deps.nodeTruthService;
    this.oracles = deps.oracleFeedsService;
  }

  async evaluate(request: PreflightGuardRequest): Promise<PreflightGuardReport> {
    const rawReport = request.protocol === 'evm'
      ? await this.evaluateEvm(request)
      : await this.evaluateBtc(request);
    return attachPreflightAttestationAndSla(rawReport);
  }

  verifyAttestation(input: PreflightAttestationVerifyRequest): AttestationVerificationResult {
    return verifyPreflightAttestation(input);
  }

  evaluateSandbox(scenario: PreflightSandboxScenario): PreflightGuardReport {
    return buildPreflightSandboxReport(scenario);
  }

  private checkStablecoinContext(
    symbol: 'USDC' | 'USDT' | 'USDe' | 'DAI' | undefined,
    findings: GuardFinding[],
    checksExecuted: string[],
    details: Record<string, unknown>
  ): number {
    if (!symbol || !this.oracles) return 0;
    const pegSnapshot = this.oracles.getStablecoinPeg();
    if (!pegSnapshot) return 0;

    checksExecuted.push('stablecoin_peg');
    const asset = pegSnapshot.assets?.find((a: any) => a.symbol === symbol);
    if (!asset) return 0;

    details.stablecoinPeg = asset;
    if (asset.depegRiskScore >= 70) {
      findings.push({
        source: 'stablecoin_peg',
        code: 'STABLECOIN_SEVERE_DEPEG',
        severity: 'CRITICAL',
        message: `${symbol} peg risk is severe (depegRiskScore=${asset.depegRiskScore}, deviation=${asset.deviationBps} bps).`,
      });
      return 45;
    }
    if (asset.depegRiskScore >= 35) {
      findings.push({
        source: 'stablecoin_peg',
        code: 'STABLECOIN_ELEVATED_DEPEG',
        severity: 'WARN',
        message: `${symbol} peg deviation elevated (depegRiskScore=${asset.depegRiskScore}, deviation=${asset.deviationBps} bps).`,
      });
      return 20;
    }
    return 0;
  }

  private async evaluateEvm(req: EvmPreflightRequest): Promise<PreflightGuardReport> {
    const checksExecuted: string[] = ['evm_simulate_tx', 'evm_address_safety'];
    const findings: GuardFinding[] = [];
    const details: Record<string, unknown> = {};

    const tasks: [
      ReturnType<EvmSafetyService['simulateTransaction']>,
      ReturnType<EvmSafetyService['inspectAddressSafety']>,
      ReturnType<Eip7702ShieldService['inspectAuthorizations']> | Promise<null>,
    ] = [
      this.evmSafety.simulateTransaction({
        chainId: req.chainId,
        from: req.from,
        to: req.to,
        data: req.data,
        value: req.value,
        blockTag: req.blockTag,
      }),
      this.evmSafety.inspectAddressSafety({
        chainId: req.chainId,
        address: req.to,
      }),
      req.authorizationList
        ? this.eip7702.inspectAuthorizations({
            executionChainId: req.chainId,
            authorizationList: req.authorizationList,
          })
        : Promise.resolve(null),
    ];

    const [simReport, addrReport, eip7702Report] = await Promise.all(tasks);
    details.evmSimulation = simReport;
    details.evmAddressSafety = addrReport;

    for (const f of simReport.findings) {
      findings.push({ source: 'evm_simulate_tx', ...f });
    }
    for (const f of addrReport.findings) {
      findings.push({ source: 'evm_address_safety', ...f });
    }

    let maxScore = Math.max(simReport.riskScore, addrReport.riskScore);

    if (eip7702Report) {
      checksExecuted.push('eip7702_shield');
      details.eip7702 = eip7702Report;
      maxScore = Math.max(maxScore, eip7702Report.riskScore);
      for (const entry of eip7702Report.entries) {
        for (const f of entry.findings) {
          findings.push({ source: 'eip7702_shield', ...f });
        }
      }
    }

    const pegPenalty = this.checkStablecoinContext(req.stablecoinSymbol, findings, checksExecuted, details);
    const riskScore = Math.min(100, Math.max(maxScore, pegPenalty > 0 ? maxScore + pegPenalty : maxScore));
    const verdict = this.decideVerdict(findings, riskScore);

    return {
      verdict,
      riskScore,
      protocol: 'evm',
      checksExecuted,
      findings,
      details,
      summary: this.buildSummary(verdict, 'evm', checksExecuted.length),
      inspectedAt: new Date().toISOString(),
    };
  }

  private async evaluateBtc(req: BtcPreflightRequest): Promise<PreflightGuardReport> {
    const checksExecuted: string[] = [];
    const findings: GuardFinding[] = [];
    const details: Record<string, unknown> = {};
    let riskScore = 5;

    const [simRes, rbfRes] = await Promise.all([
      req.rawTxHex ? this.nodeTruth.simulateTxConsensus(req.rawTxHex) : Promise.resolve(null),
      req.txid ? this.nodeTruth.checkRbfShield(req.txid) : Promise.resolve(null),
    ]);

    if (simRes) {
      checksExecuted.push('btc_simulate_tx');
      details.btcSimulation = simRes;
      if (!simRes.consensusAllowed) {
        riskScore = Math.max(riskScore, 85);
        findings.push({
          source: 'btc_simulate_tx',
          code: 'BTC_CONSENSUS_REJECTED',
          severity: 'CRITICAL',
          message: `Bitcoin Core rejected raw transaction: ${simRes.rejectReason || 'invalid script or missing inputs'}.`,
        });
      }
    }

    if (rbfRes) {
      checksExecuted.push('btc_rbf_shield');
      details.btcRbfShield = rbfRes;
      if (rbfRes.hasConflicts) {
        riskScore = Math.max(riskScore, 95);
        findings.push({
          source: 'btc_rbf_shield',
          code: 'BTC_DOUBLE_SPEND_CONFLICT',
          severity: 'CRITICAL',
          message: rbfRes.recommendation || 'Double-spend conflict detected in mempool.',
        });
      } else if (rbfRes.zeroConfRiskLevel === 'HIGH_RISK_RBF_ENABLED') {
        riskScore = Math.max(riskScore, 55);
        findings.push({
          source: 'btc_rbf_shield',
          code: 'HIGH_RISK_RBF_ENABLED',
          severity: 'WARN',
          message: rbfRes.recommendation || 'Unconfirmed transaction signals BIP-125 RBF replaceability.',
        });
      } else if (rbfRes.zeroConfRiskLevel === 'MEDIUM_RISK') {
        riskScore = Math.max(riskScore, 35);
        findings.push({
          source: 'btc_rbf_shield',
          code: 'MEDIUM_RISK_UNCONFIRMED',
          severity: 'WARN',
          message: rbfRes.recommendation || 'Unconfirmed transaction carries elevated 0-conf risk.',
        });
      }
    }

    const pegPenalty = this.checkStablecoinContext(req.stablecoinSymbol, findings, checksExecuted, details);
    const bounded = Math.min(100, riskScore + pegPenalty);
    const verdict = this.decideVerdict(findings, bounded);

    return {
      verdict,
      riskScore: bounded,
      protocol: 'btc',
      checksExecuted,
      findings,
      details,
      summary: this.buildSummary(verdict, 'btc', checksExecuted.length),
      inspectedAt: new Date().toISOString(),
    };
  }

  private decideVerdict(findings: GuardFinding[], riskScore: number): PreflightGuardVerdict {
    if (findings.some((f) => f.severity === 'CRITICAL') || riskScore >= 70) return 'BLOCK';
    if (findings.some((f) => f.severity === 'WARN') || riskScore >= 30) return 'WARN';
    return 'ALLOW';
  }

  private buildSummary(verdict: PreflightGuardVerdict, protocol: 'evm' | 'btc', count: number): string {
    const label = protocol.toUpperCase();
    if (verdict === 'BLOCK') {
      return `BLOCK (${label}): Critical risk detected across ${count} pre-flight guardrail checks. Do not sign or broadcast.`;
    }
    if (verdict === 'WARN') {
      return `WARN (${label}): Elevated risk signals detected across ${count} pre-flight checks. Review findings before proceeding.`;
    }
    return `ALLOW (${label}): All ${count} pre-flight guardrail checks passed with no critical risk signals.`;
  }
}
