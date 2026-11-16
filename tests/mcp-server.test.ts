import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createSovereignMcpServer } from '../src/interfaces/mcp/server.js';
import { ILightningPayer, PaymentResult } from '../src/application/interfaces/lightning-payer.interface.js';

class MockLightningPayer implements ILightningPayer {
  public paidInvoices: string[] = [];

  async payInvoice(invoice: string): Promise<PaymentResult> {
    this.paidInvoices.push(invoice);
    return {
      paymentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      preimage: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      feeSat: 1,
    };
  }
}

test('Sovereign MCP Server - Tool Registration & Listing', async () => {
  const { server } = createSovereignMcpServer({
    sovereignNodeUrl: 'http://127.0.0.1:3088',
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({
    name: 'test-ai-agent',
    version: '1.0.0',
  });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const toolsResponse = await client.listTools();
  assert.ok(toolsResponse.tools, 'Tools list should exist');

  const toolNames = toolsResponse.tools.map((t) => t.name);

  assert.ok(toolNames.includes('get_bitcoin_smart_fees'), 'get_bitcoin_smart_fees registered');
  assert.ok(toolNames.includes('check_rbf_fraud_shield'), 'check_rbf_fraud_shield registered');
  assert.ok(toolNames.includes('get_mempool_entropy'), 'get_mempool_entropy registered');
  assert.ok(toolNames.includes('verify_block_header'), 'verify_block_header registered');
  assert.ok(toolNames.includes('pay_lightning_invoice'), 'pay_lightning_invoice registered');
  assert.ok(toolNames.includes('get_next_block_xray'), 'get_next_block_xray registered');
  assert.ok(toolNames.includes('simulate_raw_transaction'), 'simulate_raw_transaction registered');
  assert.equal(toolsResponse.tools.length, 7, 'All 7 forensic and intelligence tools registered');

  // Verify rbf shield tool schema
  const rbfTool = toolsResponse.tools.find((t) => t.name === 'check_rbf_fraud_shield');
  assert.ok(rbfTool);
  assert.ok(rbfTool.inputSchema.properties.txid);

  await client.close();
  await server.close();
});

test('Sovereign MCP Server - pay_lightning_invoice tool execution', async () => {
  const mockPayer = new MockLightningPayer();

  const { server } = createSovereignMcpServer({
    payer: mockPayer,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'agent', version: '1.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result: any = await client.callTool({
    name: 'pay_lightning_invoice',
    arguments: {
      invoice: 'lnbc100n1mockinvoice...',
    },
  });

  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.success, true);
  assert.equal(payload.feeSat, 1);
  assert.equal(mockPayer.paidInvoices.length, 1);

  await client.close();
  await server.close();
});
