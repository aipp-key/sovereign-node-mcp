import { z } from 'zod';

export const CrewToolCheckSchema = z.object({
  tool: z.string(),
  status: z.enum(['PASS', 'FAIL', 'SKIPPED']),
  metric: z.string(),
});

export const CrewVerifiedRunSchema = z.object({
  kickoffId: z.string(),
  verifiedAt: z.string(),
  state: z.enum(['SUCCESS', 'FAILED']),
  summary: z.string(),
  verdict: z.string(),
  txid: z.string().regex(/^[0-9a-fA-F]{64}$/),
  delegateAddress: z.string().optional(),
  tools: z.array(CrewToolCheckSchema).min(1),
});

export const CrewSnapshotFileSchema = z.object({
  updatedAt: z.string().optional(),
  runs: z.record(z.string(), CrewVerifiedRunSchema),
});

export type CrewToolCheck = z.infer<typeof CrewToolCheckSchema>;
export type CrewVerifiedRun = z.infer<typeof CrewVerifiedRunSchema>;
export type CrewSnapshotFile = z.infer<typeof CrewSnapshotFileSchema>;

export type CrewFlowOverallStatus = 'ONLINE' | 'PARTIAL' | 'DEGRADED' | 'SNAPSHOT_ONLY';

export interface CrewFlowStatus {
  id: string;
  name: string;
  description: string;
  toolCount: number;
  online: boolean;
  probeConfigured: boolean;
  statusLabel: string;
  latencyMs: number | null;
  requiredInputs: string[];
  lastVerifiedRun: CrewVerifiedRun;
}

export interface CrewAiStatusResponse {
  status: CrewFlowOverallStatus;
  readOnly: true;
  publicTriggersEnabled: false;
  checkedAt: string;
  cacheTtlSeconds: number;
  cached: boolean;
  onlineCount: number;
  totalCount: number;
  mcpEndpoint: string;
  flows: CrewFlowStatus[];
}

export interface CrewFlowDefinition {
  id: string;
  name: string;
  description: string;
  toolCount: number;
  cloudUrl?: string;
  bearerToken?: string;
  defaultRequiredInputs: string[];
  defaultRun: CrewVerifiedRun;
}

export type CrewFetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface CrewAiStatusServiceOptions {
  flows: CrewFlowDefinition[];
  snapshotPath?: string;
  cacheTtlMs?: number;
  degradedCacheTtlMs?: number;
  probeTimeoutMs?: number;
  fetchFn?: CrewFetchFn;
  nowFn?: () => number;
  mcpEndpoint?: string;
}

export const DEFAULT_VERIFIED_CREW_RUNS: Record<string, CrewVerifiedRun> = {
  'full-stack-diagnostic': {
    kickoffId: 'bb3b6ede-2cae-43a7-b97c-b012bee16fcb',
    verifiedAt: '2026-11-18T18:29:32Z',
    state: 'SUCCESS',
    summary: '7/7 PASSED · 0 ERRORS',
    verdict: '7/7 PASSED',
    txid: '60fc0bacce170f6c0bdd0603da411f3b19832712fb56f820dc143a2471f5ffde',
    delegateAddress: '0x000000000000000000000000000000000000dEaD',
    tools: [
      { tool: 'get_bitcoin_smart_fees', status: 'PASS', metric: 'fastestSatPerVb: 3.44' },
      { tool: 'get_mempool_entropy', status: 'PASS', metric: 'txCount: 74,064' },
      { tool: 'verify_block_header', status: 'PASS', metric: 'height: 976,464' },
      { tool: 'get_next_block_xray', status: 'PASS', metric: 'verdict: "GUARANTEED_NEXT_BLOCK"' },
      { tool: 'check_rbf_fraud_shield', status: 'PASS', metric: 'bip125Replaceable: false' },
      {
        tool: 'simulate_raw_transaction',
        status: 'PASS',
        metric: 'consensusAllowed: true · alreadyInMempool: true · broadcast: false',
      },
      {
        tool: 'inspect_eip7702_authorization',
        status: 'PASS',
        metric: 'verdict: "SUSPICIOUS_UNVERIFIED" · riskScore: 25',
      },
    ],
  },
  'preflight-security-check': {
    kickoffId: '62f67e1f-da54-4903-9692-e52127ea0927',
    verifiedAt: '2026-11-18T17:54:41Z',
    state: 'SUCCESS',
    summary: '4/4 PASSED · VERDICT: HOLD',
    verdict: 'HOLD',
    txid: 'b7e2f08a990462ba5e15822e5e6a188b22e76047ee31714a9e53a3c707df61a4',
    tools: [
      { tool: 'get_bitcoin_smart_fees', status: 'PASS', metric: 'tx fee rate benchmark: 3.01 sat/vB' },
      { tool: 'get_mempool_entropy', status: 'PASS', metric: 'live mempool congestion & backlog verified' },
      { tool: 'get_next_block_xray', status: 'PASS', metric: 'candidate block template rank #1,890' },
      {
        tool: 'check_rbf_fraud_shield',
        status: 'PASS',
        metric: 'BIP-125 RBF enabled (0-conf replaceability risk)',
      },
    ],
  },
};
