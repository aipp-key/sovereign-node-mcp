import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  CrewAiStatusService,
  CrewFetchFn,
  createDefaultCrewAiStatusService,
} from '../src/application/services/crewai-status.service.js';
import { createCrewAiStatusRouter } from '../src/interfaces/http/controllers/crewai-status.controller.js';
import { renderEngineDashboardHtml } from '../src/interfaces/http/views/engine-dashboard.view.js';

const FAKE_DIAG_URL = 'https://secret-diag-host.invalid';
const FAKE_DIAG_TOKEN = 'secret-diag-token-xyz-123';
const FAKE_PREFLIGHT_URL = 'https://secret-preflight-host.invalid';
const FAKE_PREFLIGHT_TOKEN = 'secret-preflight-token-abc-456';

function createTestService(opts: {
  fetchFn: CrewFetchFn;
  nowFn?: () => number;
  configured?: boolean;
}): CrewAiStatusService {
  const configured = opts.configured ?? true;
  const base = createDefaultCrewAiStatusService(
    configured
      ? {
          CREWAI_DIAG_CLOUD_URL: FAKE_DIAG_URL,
          CREWAI_DIAG_BEARER_TOKEN: FAKE_DIAG_TOKEN,
          CREWAI_CLOUD_URL: FAKE_PREFLIGHT_URL,
          CREWAI_CLOUD_BEARER_TOKEN: FAKE_PREFLIGHT_TOKEN,
        }
      : {}
  );
  // Reuse default flow definitions via service constructor for clean test injection
  const flows = (base as unknown as { flows: ConstructorParameters<typeof CrewAiStatusService>[0]['flows'] }).flows;
  return new CrewAiStatusService({
    flows,
    snapshotPath: '/nonexistent-snapshot-path-for-test.json',
    fetchFn: opts.fetchFn,
    nowFn: opts.nowFn,
  });
}

describe('CrewAI Read-Only Live Heartbeat (/crewai-status)', () => {
  it('probes both flows via GET /inputs in parallel, never calls /kickoff, and leaks zero secrets', async () => {
    const calls: Array<{ url: string; method: string; auth: string | null }> = [];
    const svc = createTestService({
      fetchFn: async (url, init) => {
        const headers = new Headers(init?.headers);
        calls.push({ url, method: init?.method || 'GET', auth: headers.get('authorization') });
        if (url.startsWith(FAKE_DIAG_URL)) {
          return new Response(JSON.stringify({ required_inputs: ['txid', 'delegate_address', 'raw_tx_hex'] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ required_inputs: ['txid'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const result = await svc.getStatus();

    assert.equal(calls.length, 2);
    for (const c of calls) {
      assert.equal(c.method, 'GET');
      assert.ok(c.url.endsWith('/inputs'), `Expected /inputs URL, got ${c.url}`);
      assert.ok(!c.url.includes('kickoff'), 'Must never call /kickoff');
    }

    assert.equal(result.status, 'ONLINE');
    assert.equal(result.readOnly, true);
    assert.equal(result.publicTriggersEnabled, false);
    assert.equal(result.onlineCount, 2);
    assert.equal(result.totalCount, 2);
    assert.equal(result.cached, false);
    assert.deepEqual(result.flows[0].requiredInputs, ['txid', 'delegate_address', 'raw_tx_hex']);
    assert.deepEqual(result.flows[1].requiredInputs, ['txid']);

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('secret-diag-host.invalid'));
    assert.ok(!serialized.includes('secret-preflight-host.invalid'));
    assert.ok(!serialized.includes(FAKE_DIAG_TOKEN));
    assert.ok(!serialized.includes(FAKE_PREFLIGHT_TOKEN));
  });

  it('serves 15-minute cache hits and deduplicates concurrent in-flight requests', async () => {
    let now = 1_795_000_000_000;
    let fetchCount = 0;

    const svc = createTestService({
      nowFn: () => now,
      fetchFn: async () => {
        fetchCount += 1;
        await new Promise((r) => setTimeout(r, 15));
        return new Response(JSON.stringify({ required_inputs: ['txid'] }), { status: 200 });
      },
    });

    const [a, b, c] = await Promise.all([svc.getStatus(), svc.getStatus(), svc.getStatus()]);
    assert.equal(fetchCount, 2, 'Concurrent callers must share a single probe per flow');
    assert.equal(a.cached, false);
    assert.equal(b.cached, false);
    assert.equal(c.cached, false);

    now += 5 * 60 * 1000;
    const cachedRes = await svc.getStatus();
    assert.equal(cachedRes.cached, true);
    assert.equal(fetchCount, 2, 'Cached call within 15 min must not issue network probes');

    now += 11 * 60 * 1000;
    const refreshed = await svc.getStatus();
    assert.equal(refreshed.cached, false);
    assert.equal(fetchCount, 4, 'Expired cache should refresh');
  });

  it('returns DEGRADED safely on upstream 503/timeout while preserving verified mainnet run data', async () => {
    const svc = createTestService({
      fetchFn: async (url) => {
        if (url.startsWith(FAKE_DIAG_URL)) {
          return new Response('Upstream error', { status: 503 });
        }
        throw new Error(`Network failure connecting to ${FAKE_PREFLIGHT_URL} with ${FAKE_PREFLIGHT_TOKEN}`);
      },
    });

    const result = await svc.getStatus();
    assert.equal(result.status, 'DEGRADED');
    assert.equal(result.onlineCount, 0);
    assert.equal(result.flows[0].online, false);
    assert.equal(result.flows[0].statusLabel, 'DEGRADED');
    assert.equal(result.flows[0].lastVerifiedRun.kickoffId, 'bb3b6ede-2cae-43a7-b97c-b012bee16fcb');
    assert.equal(result.flows[1].lastVerifiedRun.kickoffId, '62f67e1f-da54-4903-9692-e52127ea0927');

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(FAKE_PREFLIGHT_URL));
    assert.ok(!serialized.includes(FAKE_PREFLIGHT_TOKEN));
  });

  it('returns SNAPSHOT_ONLY with zero network calls when CrewAI env vars are absent', async () => {
    let fetchCount = 0;
    const svc = createTestService({
      configured: false,
      fetchFn: async () => {
        fetchCount += 1;
        return new Response('{}', { status: 200 });
      },
    });

    const result = await svc.getStatus();
    assert.equal(fetchCount, 0);
    assert.equal(result.status, 'SNAPSHOT_ONLY');
    assert.equal(result.onlineCount, 0);
    assert.equal(result.flows[0].probeConfigured, false);
    assert.equal(result.flows[0].statusLabel, 'VERIFIED SNAPSHOT');
  });

  it('exposes GET /crewai-status with CORS headers and never exposes POST /crewai-status', async () => {
    const svc = createTestService({
      fetchFn: async () => new Response(JSON.stringify({ required_inputs: ['txid'] }), { status: 200 }),
    });
    const app = express();
    app.use(createCrewAiStatusRouter(svc));
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = server.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      const getRes = await fetch(`${baseUrl}/crewai-status`);
      assert.equal(getRes.status, 200);
      assert.equal(getRes.headers.get('access-control-allow-origin'), '*');
      const body = (await getRes.json()) as { status: string; publicTriggersEnabled: boolean };
      assert.equal(body.status, 'ONLINE');
      assert.equal(body.publicTriggersEnabled, false);

      const postRes = await fetch(`${baseUrl}/crewai-status`, { method: 'POST' });
      assert.equal(postRes.status, 404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('renders #crewai Live Verification section on dashboard without /kickoff or secrets', () => {
    const html = renderEngineDashboardHtml();
    assert.ok(html.includes('id="crewai"'));
    assert.ok(html.includes('/crewai-status'));
    assert.ok(html.includes('bb3b6ede-2cae-43a7-b97c-b012bee16fcb'));
    assert.ok(html.includes('62f67e1f-da54-4903-9692-e52127ea0927'));
    assert.ok(html.includes('https://mempool.space/tx/'));
    assert.ok(html.includes('https://smith.langchain.com/public/012d9240-a232-414a-8a6d-20297cf3aafd/r'));
    assert.ok(html.includes('https://github.com/sovroutecore/sovroute-langchain-guardrail'));
    assert.ok(!html.includes('/kickoff'), 'Dashboard must not contain /kickoff trigger endpoints');
    assert.ok(!html.includes('CREWAI_CLOUD_BEARER_TOKEN'));
    assert.ok(!html.includes('MCP_DEMO_BYPASS_KEY'));
  });
});
