import {
  Eip7702AuthorizationEntry,
  Eip7702EntryReport,
  Eip7702Finding,
  Eip7702ShieldReport,
  Eip7702ShieldRequest,
  Eip7702Verdict,
} from '../../domain/schemas/eip7702.schema.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const DEFAULT_CHAIN_RPCS: Record<number, string> = {
  1: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  10: process.env.OPTIMISM_RPC_URL || 'https://optimism-rpc.publicnode.com',
  137: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  8453: process.env.BASE_RPC_URL || 'https://base-rpc.publicnode.com',
  42161: process.env.ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com',
  11155111: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
};

const VERIFIED_DELEGATION_STANDARDS: Record<string, string> = {
  '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b': 'MetaMask EIP-7702 StatelesDelegator',
  '0x29fcb43b46531bca003ddc8fcb67ffe91900c762': 'SafeL2 v1.4.1 Singleton',
  '0x41675c099f32341bf84bfc5382af534df5c7461a': 'Safe v1.4.1 Singleton',
  '0xd6cedde84be40893d153be9d467cd6ad37875b28': 'ZeroDev Kernel v3.1 (ERC-7579)',
  '0x0000000000433a91cc3912b5130f64a1f629a578': 'Biconomy Nexus (ERC-7579)',
  '0x000100abaad02f1cfc8bbe32bd5a564817339e72': 'Coinbase Smart Wallet v1',
  '0x000000000000c5a9089039570dd36455b5c07383': 'Alchemy Modular Account v2',
};

const DRAIN_SELECTORS: Record<string, string> = {
  a9059cbb: 'transfer(address,uint256)',
  '23b872dd': 'transferFrom(address,address,uint256)',
  '095ea7b3': 'approve(address,uint256)',
  a22cb465: 'setApprovalForAll(address,bool)',
};

export interface Eip7702ScannerOptions {
  getCode?: (chainId: number, address: string) => Promise<string>;
}

interface DisassemblyResult {
  bytecodeSizeBytes: number;
  opcodes: {
    selfdestruct: boolean;
    delegatecall: boolean;
    create: boolean;
    create2: boolean;
  };
  drainSelectors: string[];
}

export function parseUint(value: number | string): number {
  if (typeof value === 'number') return value;
  return value.startsWith('0x') ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
}

/**
 * Walks EVM bytecode skipping PUSH1..PUSH32 immediate data to avoid false positives.
 */
export function disassembleEvmBytecode(hexCode: string): DisassemblyResult {
  const clean = hexCode.startsWith('0x') ? hexCode.slice(2).toLowerCase() : hexCode.toLowerCase();
  const byteLen = Math.floor(clean.length / 2);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  let selfdestruct = false;
  let delegatecall = false;
  let create = false;
  let create2 = false;
  const selectorSet = new Set<string>();

  for (let pc = 0; pc < bytes.length; pc++) {
    const op = bytes[pc];
    if (op === 0xff) selfdestruct = true;
    else if (op === 0xf4) delegatecall = true;
    else if (op === 0xf0) create = true;
    else if (op === 0xf5) create2 = true;

    if (op === 0x63 && pc + 4 < bytes.length) {
      const sel = clean.slice((pc + 1) * 2, (pc + 5) * 2);
      if (DRAIN_SELECTORS[sel]) {
        selectorSet.add(`${DRAIN_SELECTORS[sel]} [0x${sel}]`);
      }
    }

    if (op >= 0x60 && op <= 0x7f) {
      const pushBytes = op - 0x5f;
      pc += pushBytes;
    }
  }

  return {
    bytecodeSizeBytes: byteLen,
    opcodes: { selfdestruct, delegatecall, create, create2 },
    drainSelectors: [...selectorSet],
  };
}

async function fetchRpcCode(chainId: number, address: string): Promise<string> {
  const rpcUrl = DEFAULT_CHAIN_RPCS[chainId];
  if (!rpcUrl) return '0x';

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getCode',
        params: [address, 'latest'],
      }),
      signal: AbortSignal.timeout(4000),
    });
    const json: any = await res.json();
    return typeof json?.result === 'string' ? json.result : '0x';
  } catch {
    return '0x';
  }
}

export class Eip7702ScannerAdapter {
  private readonly getCodeFn: (chainId: number, address: string) => Promise<string>;

  constructor(options: Eip7702ScannerOptions = {}) {
    this.getCodeFn = options.getCode ?? fetchRpcCode;
  }

  async inspectAuthorizationList(request: Eip7702ShieldRequest): Promise<Eip7702ShieldReport> {
    const execChainId = request.executionChainId ?? null;
    const entries = await Promise.all(
      request.authorizationList.map((entry, index) => this.inspectEntry(entry, index, execChainId))
    );

    const verdict = this.aggregateVerdict(entries);
    const riskScore = this.computeRiskScore(entries, verdict);

    return {
      verdict,
      riskScore,
      executionChainId: execChainId,
      totalAuthorizations: entries.length,
      summary: this.buildSummary(verdict, entries),
      entries,
      inspectedAt: new Date().toISOString(),
    };
  }

  private async inspectEntry(
    entry: Eip7702AuthorizationEntry,
    index: number,
    execChainId: number | null
  ): Promise<Eip7702EntryReport> {
    const chainId = parseUint(entry.chainId);
    const nonce = parseUint(entry.nonce);
    const address = entry.address.toLowerCase();
    const isRevocation = address === ZERO_ADDRESS;
    const findings: Eip7702Finding[] = [];

    const crossChainReplayRisk = chainId === 0;
    if (crossChainReplayRisk) {
      findings.push({
        code: 'CROSS_CHAIN_WILDCARD_REPLAY',
        severity: isRevocation ? 'INFO' : 'CRITICAL',
        message: 'Authorization uses chainId=0, making it replayable across all EVM chains.',
      });
    } else if (execChainId !== null && chainId !== execChainId) {
      findings.push({
        code: 'CHAIN_ID_MISMATCH',
        severity: 'WARN',
        message: `Authorization chainId (${chainId}) does not match executionChainId (${execChainId}).`,
      });
    }

    if (isRevocation) {
      findings.push({
        code: 'REVOCATION_ZERO_ADDRESS',
        severity: 'INFO',
        message: 'Targets zero address to clear/revoke existing EIP-7702 delegation.',
      });
      return {
        index,
        chainId,
        address,
        nonce,
        isRevocation: true,
        reputation: 'REVOCATION_ZERO',
        standardLabel: 'EIP-7702 Delegation Revocation',
        bytecodeSizeBytes: 0,
        crossChainReplayRisk,
        detectedOpcodes: { selfdestruct: false, delegatecall: false, create: false, create2: false },
        detectedDrainSelectors: [],
        findings,
        verdict: crossChainReplayRisk ? 'SUSPICIOUS_UNVERIFIED' : 'SAFE_VERIFIED',
      };
    }

    const standardLabel = VERIFIED_DELEGATION_STANDARDS[address] ?? null;
    const reputation = standardLabel ? 'VERIFIED_STANDARD' : 'UNVERIFIED';
    const lookupChain = chainId === 0 ? execChainId ?? 1 : chainId;
    const rawBytecode = entry.bytecode ?? (await this.getCodeFn(lookupChain, address));
    const disasm = disassembleEvmBytecode(rawBytecode);

    if (disasm.bytecodeSizeBytes === 0 && !standardLabel) {
      findings.push({
        code: 'EMPTY_BYTECODE_TARGET',
        severity: 'WARN',
        message: 'Target delegation address has no deployed bytecode on-chain.',
      });
    }

    if (disasm.opcodes.selfdestruct) {
      findings.push({
        code: 'OPCODE_SELFDESTRUCT',
        severity: 'CRITICAL',
        message: 'SELFDESTRUCT (0xff) opcode detected in target delegation bytecode.',
      });
    }

    if (disasm.opcodes.delegatecall && !standardLabel) {
      findings.push({
        code: 'UNVERIFIED_DELEGATECALL',
        severity: disasm.drainSelectors.length > 0 ? 'CRITICAL' : 'WARN',
        message: 'DELEGATECALL (0xf4) opcode detected in unverified delegation contract.',
      });
    }

    if (disasm.drainSelectors.length > 0 && !standardLabel) {
      findings.push({
        code: 'TOKEN_DRAIN_SELECTORS',
        severity: disasm.opcodes.delegatecall ? 'CRITICAL' : 'WARN',
        message: `Unverified contract embeds token transfer/approval selectors: ${disasm.drainSelectors.join(', ')}`,
      });
    }

    if (!standardLabel && findings.every((f) => f.severity === 'INFO')) {
      findings.push({
        code: 'UNVERIFIED_CONTRACT',
        severity: 'WARN',
        message: 'Delegation target is not in the audited EIP-7702 standard registry.',
      });
    }

    const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
    const hasWarn = findings.some((f) => f.severity === 'WARN');
    const verdict: Eip7702Verdict = hasCritical
      ? 'CRITICAL_DRAIN_RISK'
      : hasWarn
        ? 'SUSPICIOUS_UNVERIFIED'
        : 'SAFE_VERIFIED';

    return {
      index,
      chainId,
      address,
      nonce,
      isRevocation: false,
      reputation,
      standardLabel,
      bytecodeSizeBytes: disasm.bytecodeSizeBytes,
      crossChainReplayRisk,
      detectedOpcodes: disasm.opcodes,
      detectedDrainSelectors: disasm.drainSelectors,
      findings,
      verdict,
    };
  }

  private aggregateVerdict(entries: Eip7702EntryReport[]): Eip7702Verdict {
    if (entries.some((e) => e.verdict === 'CRITICAL_DRAIN_RISK')) return 'CRITICAL_DRAIN_RISK';
    if (entries.some((e) => e.verdict === 'SUSPICIOUS_UNVERIFIED')) return 'SUSPICIOUS_UNVERIFIED';
    return 'SAFE_VERIFIED';
  }

  private computeRiskScore(entries: Eip7702EntryReport[], verdict: Eip7702Verdict): number {
    if (verdict === 'SAFE_VERIFIED') return 0;
    let score = 0;
    for (const e of entries) {
      for (const f of e.findings) {
        score += f.severity === 'CRITICAL' ? 45 : f.severity === 'WARN' ? 20 : 0;
      }
    }
    return Math.min(100, Math.max(verdict === 'CRITICAL_DRAIN_RISK' ? 75 : 25, score));
  }

  private buildSummary(verdict: Eip7702Verdict, entries: Eip7702EntryReport[]): string {
    if (verdict === 'CRITICAL_DRAIN_RISK') {
      return `CRITICAL: ${entries.length} EIP-7702 authorization(s) contain high-risk drain vectors (e.g., wildcard chainId=0, SELFDESTRUCT, or unverified DELEGATECALL+transfer hooks).`;
    }
    if (verdict === 'SUSPICIOUS_UNVERIFIED') {
      return `SUSPICIOUS: ${entries.length} EIP-7702 authorization(s) target unverified or mismatched delegation contracts. Manual audit recommended.`;
    }
    return `SAFE: All ${entries.length} EIP-7702 authorization(s) target audited standards or valid revocations with chain-bound replay protection.`;
  }
}
