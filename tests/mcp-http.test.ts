import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createMcpRouter } from '../src/interfaces/http/controllers/mcp.controller.js';

function createMockServices() {
  const nodeTruthService = {
    getSmartFeeEstimates: async () => ({ fastestFeeSatPerVb: 12, halfHourFeeSatPerVb: 8, hourFeeSatPerVb: 4 }),
    getMempoolEntropy: async () => ({ txCount: 45000, vsizeMb: 62.4, totalFeeSats: 1500000 }),
    checkRbfShield: async (txid: string) => ({ txid, rbfSignaled: false, riskLevel: 'LOW' }),
    getNextBlockXray: async (txid?: string) => ({ candidateHeight: 976000, cutoffFeeRateSatPerVb: 5.2, txid }),
    simulateTxConsensus: async (_rawTxHex: string) => ({ allowed: true, broadcastedToNetwork: false }),
    getLatestBlockHeader: async () => ({ height: 975999, hash: '0'.repeat(64) }),
  } as any;

  const eip7702ShieldService = {
    inspectAuthorizations: async () => ({ verdict: 'SAFE_VERIFIED', riskScore: 0, entries: [] }),
  } as any;

  return { nodeTruthService, eip7702ShieldService };
}

async function postMcp(baseUrl: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('Hosted Remote Streamable HTTP MCP (/mcp)', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    const app = express();
    app.use(express.json());
    const { nodeTruthService, eip7702ShieldService } = createMockServices();
    app.use(createMcpRouter(nodeTruthService, eip7702ShieldService));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('responds to initialize and lists exactly 7 deterministic read-only tools (excludes pay_lightning_invoice and ML prototype)', async () => {
    const initRes = await postMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'crewai-test', version: '1.0.0' },
      },
    });
    assert.equal(initRes.status, 200);
    assert.equal(initRes.headers.get('x-sandbox-limit'), null);

    const listRes = await postMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.headers.get('x-sandbox-limit'), null);
    const listText = await listRes.text();
    const jsonLine = listText.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim() || listText;
    const parsed = JSON.parse(jsonLine);
    const toolNames = parsed.result.tools.map((t: any) => t.name);

    assert.equal(toolNames.length, 7);
    assert.ok(toolNames.includes('get_bitcoin_smart_fees'));
    assert.ok(toolNames.includes('check_rbf_fraud_shield'));
    assert.ok(toolNames.includes('get_next_block_xray'));
    assert.ok(toolNames.includes('simulate_raw_transaction'));
    assert.ok(!toolNames.includes('scan_evm_bytecode_risk_ml'));
    assert.ok(!toolNames.includes('pay_lightning_invoice'), 'Hosted MCP must never expose spending tool');
  });

  it('executes get_bitcoin_smart_fees within 15/day sandbox and rejects malformed txid in check_rbf_fraud_shield', async () => {
    const callRes = await postMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_bitcoin_smart_fees', arguments: {} },
    });
    assert.equal(callRes.status, 200);
    assert.equal(callRes.headers.get('x-sandbox-limit'), '15');
    assert.equal(callRes.headers.get('x-sandbox-remaining'), '14');
    const callText = await callRes.text();
    assert.ok(callText.includes('fastestFeeSatPerVb'));

    const badRes = await postMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'check_rbf_fraud_shield', arguments: { txid: 'not-a-txid' } },
    });
    assert.equal(badRes.headers.get('x-sandbox-remaining'), '13');
    const badText = await badRes.text();
    assert.ok(badText.includes('error') || badText.includes('isError'));
  });

  it('returns 405 on GET /mcp and requires 402 Pay-Per-Call on tools/call when sandbox is disabled', async () => {
    const getRes = await fetch(`${baseUrl}/mcp`);
    assert.equal(getRes.status, 405);

    const prevSandbox = process.env.SOVROUTE_MCP_SANDBOX_ENABLED;
    try {
      process.env.SOVROUTE_MCP_SANDBOX_ENABLED = 'false';

      const listWhilePaidOnly = await postMcp(baseUrl, { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} });
      assert.equal(listWhilePaidOnly.status, 200);

      const unpaidCall = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'get_bitcoin_smart_fees', arguments: {} },
      });
      assert.equal(unpaidCall.status, 402);
      const unpaidJson = await unpaidCall.json();
      assert.equal(unpaidJson.protocol, 'L402 / x402');
      assert.equal(unpaidJson.priceSats, 1);

      process.env.MCP_DEMO_BYPASS_KEY = 'demo-secret-key-test';
      const wrongDemoCall = await postMcp(
        baseUrl,
        { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_bitcoin_smart_fees', arguments: {} } },
        { 'X-SovRoute-Demo-Key': 'wrong-key' }
      );
      assert.equal(wrongDemoCall.status, 402);

      const validDemoCall = await postMcp(
        baseUrl,
        { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'get_bitcoin_smart_fees', arguments: {} } },
        { 'X-SovRoute-Demo-Key': 'demo-secret-key-test' }
      );
      assert.equal(validDemoCall.status, 200);
      assert.equal(validDemoCall.headers.get('x-sandbox-bypass'), 'demo');

      const nullOptCall = await postMcp(
        baseUrl,
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'inspect_eip7702_authorization',
            arguments: {
              executionChainId: 1,
              authorizationList: [
                { chainId: 1, address: '0x000000000000000000000000000000000000dEaD', nonce: 0, bytecode: null },
              ],
            },
          },
        },
        { 'X-SovRoute-Demo-Key': 'demo-secret-key-test' }
      );
      assert.equal(nullOptCall.status, 200);
      const nullOptText = await nullOptCall.text();
      assert.ok(nullOptText.includes('SAFE_VERIFIED'));
    } finally {
      delete process.env.MCP_DEMO_BYPASS_KEY;
      if (prevSandbox === undefined) delete process.env.SOVROUTE_MCP_SANDBOX_ENABLED;
      else process.env.SOVROUTE_MCP_SANDBOX_ENABLED = prevSandbox;
    }
  });
});
