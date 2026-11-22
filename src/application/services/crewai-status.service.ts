import fs from 'node:fs';
import path from 'node:path';
import {
  CrewAiStatusResponse,
  CrewAiStatusServiceOptions,
  CrewFetchFn,
  CrewFlowDefinition,
  CrewFlowOverallStatus,
  CrewFlowStatus,
  CrewSnapshotFileSchema,
  CrewVerifiedRun,
  DEFAULT_VERIFIED_CREW_RUNS,
} from '../../domain/schemas/crewai-status.schema.js';

export type { CrewAiStatusServiceOptions, CrewFetchFn, CrewFlowDefinition };

interface CacheEntry {
  value: CrewAiStatusResponse;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_DEGRADED_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = 5000;
const DEFAULT_MCP_ENDPOINT = 'https://node.sovroute.com/mcp';

function extractRequiredInputs(payload: unknown, fallback: string[]): string[] {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }
  const obj = payload as Record<string, unknown>;
  const raw = Array.isArray(obj.required_inputs)
    ? obj.required_inputs
    : Array.isArray(obj.inputs)
      ? obj.inputs
      : null;
  if (!raw) {
    return fallback;
  }
  const filtered = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return filtered.length > 0 ? filtered : fallback;
}

/**
 * Pure read-only application service that probes CrewAI Cloud `/inputs` endpoints
 * with caching and in-flight deduplication, merged with verified mainnet run proof.
 */
export class CrewAiStatusService {
  private readonly flows: CrewFlowDefinition[];
  private readonly snapshotPath: string;
  private readonly cacheTtlMs: number;
  private readonly degradedCacheTtlMs: number;
  private readonly probeTimeoutMs: number;
  private readonly fetchFn: CrewFetchFn;
  private readonly nowFn: () => number;
  private readonly mcpEndpoint: string;
  private cache: CacheEntry | null = null;
  private inFlight: Promise<CrewAiStatusResponse> | null = null;

  constructor(options: CrewAiStatusServiceOptions) {
    this.flows = options.flows;
    this.snapshotPath = options.snapshotPath ?? path.resolve(process.cwd(), 'data', 'crewai-verified-runs.json');
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.degradedCacheTtlMs = options.degradedCacheTtlMs ?? DEFAULT_DEGRADED_CACHE_TTL_MS;
    this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.mcpEndpoint = options.mcpEndpoint ?? DEFAULT_MCP_ENDPOINT;
  }

  async getStatus(): Promise<CrewAiStatusResponse> {
    const now = this.nowFn();
    if (this.cache && now < this.cache.expiresAt) {
      return {
        ...this.cache.value,
        cached: true,
      };
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.refreshStatus();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async refreshStatus(): Promise<CrewAiStatusResponse> {
    const snapshotRuns = await this.loadDiskSnapshots();
    const flows = await Promise.all(this.flows.map((flow) => this.probeFlow(flow, snapshotRuns)));

    const configuredFlows = flows.filter((f) => f.probeConfigured);
    const onlineCount = flows.filter((f) => f.online).length;
    const totalCount = flows.length;

    let status: CrewFlowOverallStatus;
    if (configuredFlows.length === 0) {
      status = 'SNAPSHOT_ONLY';
    } else if (onlineCount === totalCount) {
      status = 'ONLINE';
    } else if (onlineCount > 0) {
      status = 'PARTIAL';
    } else {
      status = 'DEGRADED';
    }

    const allConfiguredOnline = configuredFlows.length > 0 && configuredFlows.every((f) => f.online);
    const ttlMs = allConfiguredOnline ? this.cacheTtlMs : this.degradedCacheTtlMs;
    const checkedAt = new Date(this.nowFn()).toISOString();

    const response: CrewAiStatusResponse = {
      status,
      readOnly: true,
      publicTriggersEnabled: false,
      checkedAt,
      cacheTtlSeconds: Math.floor(ttlMs / 1000),
      cached: false,
      onlineCount,
      totalCount,
      mcpEndpoint: this.mcpEndpoint,
      flows,
    };

    this.cache = {
      value: response,
      expiresAt: this.nowFn() + ttlMs,
    };

    return response;
  }

  private buildFlowResult(
    flow: CrewFlowDefinition,
    lastVerifiedRun: CrewVerifiedRun,
    patch: Pick<CrewFlowStatus, 'online' | 'probeConfigured' | 'statusLabel' | 'latencyMs' | 'requiredInputs'>
  ): CrewFlowStatus {
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      toolCount: flow.toolCount,
      ...patch,
      lastVerifiedRun,
    };
  }

  private async probeFlow(
    flow: CrewFlowDefinition,
    snapshotRuns: Record<string, CrewVerifiedRun>
  ): Promise<CrewFlowStatus> {
    const lastVerifiedRun = snapshotRuns[flow.id] ?? flow.defaultRun;
    const cloudUrl = flow.cloudUrl?.trim();
    const bearerToken = flow.bearerToken?.trim();

    if (!cloudUrl || !bearerToken) {
      return this.buildFlowResult(flow, lastVerifiedRun, {
        online: false,
        probeConfigured: false,
        statusLabel: 'VERIFIED SNAPSHOT',
        latencyMs: null,
        requiredInputs: flow.defaultRequiredInputs,
      });
    }

    const inputsUrl = `${cloudUrl.replace(/\/+$/, '')}/inputs`;
    const startedAt = this.nowFn();
    let latencyMs: number | null = null;

    try {
      const res = await this.fetchFn(inputsUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearerToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.probeTimeoutMs),
      });
      latencyMs = Math.max(0, this.nowFn() - startedAt);
      if (res.status === 200) {
        const parsed = await res.json().catch(() => null);
        return this.buildFlowResult(flow, lastVerifiedRun, {
          online: true,
          probeConfigured: true,
          statusLabel: 'Crew is Online',
          latencyMs,
          requiredInputs: extractRequiredInputs(parsed, flow.defaultRequiredInputs),
        });
      }
    } catch {
      // Never surface raw fetch error messages that could embed upstream hostnames or tokens
    }

    return this.buildFlowResult(flow, lastVerifiedRun, {
      online: false,
      probeConfigured: true,
      statusLabel: 'DEGRADED',
      latencyMs,
      requiredInputs: flow.defaultRequiredInputs,
    });
  }

  private async loadDiskSnapshots(): Promise<Record<string, CrewVerifiedRun>> {
    try {
      const raw = await fs.promises.readFile(this.snapshotPath, 'utf8');
      const parsedJson: unknown = JSON.parse(raw);
      const validated = CrewSnapshotFileSchema.safeParse(parsedJson);
      if (!validated.success) {
        return {};
      }
      return validated.data.runs;
    } catch {
      return {};
    }
  }
}

export function createDefaultCrewAiStatusService(
  env: Record<string, string | undefined> = process.env
): CrewAiStatusService {
  return new CrewAiStatusService({
    flows: [
      {
        id: 'full-stack-diagnostic',
        name: 'SovRoute Full Stack Diagnostic-v1',
        description:
          'End-to-end diagnostic crew executing all 7 deterministic Bitcoin L1 and EVM EIP-7702 tools over Streamable HTTP MCP.',
        toolCount: 7,
        cloudUrl: env.CREWAI_DIAG_CLOUD_URL,
        bearerToken: env.CREWAI_DIAG_BEARER_TOKEN,
        defaultRequiredInputs: ['txid', 'delegate_address', 'raw_tx_hex'],
        defaultRun: DEFAULT_VERIFIED_CREW_RUNS['full-stack-diagnostic'],
      },
      {
        id: 'preflight-security-check',
        name: 'Bitcoin Pre-Flight Security Check-v1',
        description:
          'Autonomous payment guardrail crew verifying smart fees, mempool entropy, next-block template rank, and BIP-125 RBF risk.',
        toolCount: 4,
        cloudUrl: env.CREWAI_CLOUD_URL,
        bearerToken: env.CREWAI_CLOUD_BEARER_TOKEN,
        defaultRequiredInputs: ['txid'],
        defaultRun: DEFAULT_VERIFIED_CREW_RUNS['preflight-security-check'],
      },
    ],
  });
}
