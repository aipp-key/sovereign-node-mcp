import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyAgenticMarketSignature } from '../src/interfaces/http/middleware/agentic-market.helper.js';

test('AgenticMarket HMAC Verification - Security & Boundary Suite', async (t) => {
  const secret = 'test-secret-key-agentic-market-99999999999999999';

  await t.test('1. Valid HMAC signature and current timestamp passes verification', () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = Buffer.from(JSON.stringify({ test: 'hello agentic' }));
    const msg = Buffer.concat([Buffer.from(`${ts}.`, 'utf8'), body]);
    const sig = crypto.createHmac('sha256', secret).update(msg).digest('hex');

    const mockReq: any = {
      header: (name: string) => {
        if (name.toLowerCase() === 'x-agenticmarket-signature') return `t=${ts},v1=${sig}`;
        if (name.toLowerCase() === 'x-agenticmarket-timestamp') return String(ts);
        return undefined;
      },
      rawBody: body,
      body: JSON.parse(body.toString()),
    };

    const result = verifyAgenticMarketSignature(mockReq, secret);
    assert.equal(result.isValid, true);
  });

  await t.test('2. Replay Attack Prevention - Expired timestamp (> 300s) is rejected', () => {
    const expiredTs = Math.floor(Date.now() / 1000) - 305; // 305 seconds ago
    const body = Buffer.from(JSON.stringify({ query: 'expired' }));
    const msg = Buffer.concat([Buffer.from(`${expiredTs}.`, 'utf8'), body]);
    const sig = crypto.createHmac('sha256', secret).update(msg).digest('hex');

    const mockReq: any = {
      header: (name: string) => {
        if (name.toLowerCase() === 'x-agenticmarket-signature') return `t=${expiredTs},v1=${sig}`;
        if (name.toLowerCase() === 'x-agenticmarket-timestamp') return String(expiredTs);
        return undefined;
      },
      rawBody: body,
    };

    const result = verifyAgenticMarketSignature(mockReq, secret);
    assert.equal(result.isValid, false);
    assert.match(result.reason || '', /expired/i);
  });

  await t.test('3. Forgery Protection - Signature generated with wrong secret is rejected', () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = Buffer.from(JSON.stringify({ action: 'forge' }));
    const msg = Buffer.concat([Buffer.from(`${ts}.`, 'utf8'), body]);
    const fakeSig = crypto.createHmac('sha256', 'wrong-attacker-secret').update(msg).digest('hex');

    const mockReq: any = {
      header: (name: string) => {
        if (name.toLowerCase() === 'x-agenticmarket-signature') return `t=${ts},v1=${fakeSig}`;
        if (name.toLowerCase() === 'x-agenticmarket-timestamp') return String(ts);
        return undefined;
      },
      rawBody: body,
    };

    const result = verifyAgenticMarketSignature(mockReq, secret);
    assert.equal(result.isValid, false);
    assert.match(result.reason || '', /signature mismatch/i);
  });

  await t.test('4. Payload Tampering - Body modified in transit is rejected', () => {
    const ts = Math.floor(Date.now() / 1000);
    const originalBody = Buffer.from(JSON.stringify({ amount: 10 }));
    const msg = Buffer.concat([Buffer.from(`${ts}.`, 'utf8'), originalBody]);
    const sig = crypto.createHmac('sha256', secret).update(msg).digest('hex');

    const tamperedBody = Buffer.from(JSON.stringify({ amount: 1000000 }));
    const mockReq: any = {
      header: (name: string) => {
        if (name.toLowerCase() === 'x-agenticmarket-signature') return `t=${ts},v1=${sig}`;
        if (name.toLowerCase() === 'x-agenticmarket-timestamp') return String(ts);
        return undefined;
      },
      rawBody: tamperedBody,
    };

    const result = verifyAgenticMarketSignature(mockReq, secret);
    assert.equal(result.isValid, false);
  });

  await t.test('5. Missing or Malformed Headers fail safely', () => {
    const mockReqNoHeaders: any = {
      header: () => undefined,
    };
    const result1 = verifyAgenticMarketSignature(mockReqNoHeaders, secret);
    assert.equal(result1.isValid, false);

    const mockReqBadTs: any = {
      header: (name: string) => (name.includes('signature') ? 'v1=abc' : 'not-a-number'),
    };
    const result2 = verifyAgenticMarketSignature(mockReqBadTs, secret);
    assert.equal(result2.isValid, false);
  });
});
