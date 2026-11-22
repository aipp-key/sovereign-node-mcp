import test from 'node:test';
import assert from 'node:assert/strict';
import { BtcWatchtowerService } from '../src/application/services/btc-watchtower.service.js';
import {
  signWatchtowerPayload,
  validatePublicWebhookUrl,
} from '../src/infrastructure/watchtower/webhook-dispatcher.helper.js';

const TXID = 'a'.repeat(64);

test('validatePublicWebhookUrl blocks SSRF targets (localhost, private IPv4, Tailscale, HTTP)', () => {
  assert.equal(validatePublicWebhookUrl('http://example.com/hook').ok, false);
  assert.equal(validatePublicWebhookUrl('https://localhost/hook').ok, false);
  assert.equal(validatePublicWebhookUrl('https://127.0.0.1/hook').ok, false);
  assert.equal(validatePublicWebhookUrl('https://10.0.0.5/hook').ok, false);
  assert.equal(validatePublicWebhookUrl('https://100.95.119.88/hook').ok, false);
  assert.equal(validatePublicWebhookUrl('https://169.254.169.254/latest/meta-data').ok, false);
  assert.equal(validatePublicWebhookUrl('https://[::1]/hook').ok, false);
  assert.equal(validatePublicWebhookUrl('https://agent.example.com/webhooks/btc').ok, true);
});

test('BtcWatchtowerService tracks RBF tx -> CONFIRMED and dispatches HMAC-signed webhook', async () => {
  let probeCall = 0;
  const mockNodeTruth = {
    checkRbfShield: async () => {
      probeCall++;
      if (probeCall === 1) {
        return {
          isInMempool: true,
          bip125Replaceable: true,
          hasConflicts: false,
          confirmations: 0,
          feeRateSatPerVb: 12,
          zeroConfRiskLevel: 'HIGH_RISK_RBF_ENABLED',
          recommendation: 'RBF enabled',
        };
      }
      return {
        isInMempool: false,
        bip125Replaceable: false,
        hasConflicts: false,
        confirmations: 1,
        feeRateSatPerVb: 12,
        zeroConfRiskLevel: 'SAFE',
        recommendation: 'Confirmed',
      };
    },
  } as any;

  const receivedWebhooks: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const svc = new BtcWatchtowerService(mockNodeTruth, {
    fetchFn: async (url, init) => {
      receivedWebhooks.push({
        url,
        headers: (init.headers as Record<string, string>) || {},
        body: String(init.body || ''),
      });
      return { ok: true, status: 200 };
    },
  });

  const created = await svc.createWatch({
    txid: TXID,
    webhookUrl: 'https://agent.example.com/webhooks/btc',
    ttlHours: 24,
    confirmationsTarget: 1,
  });

  assert.equal(created.watch.status, 'WATCHING');
  assert.equal(created.watch.bip125Replaceable, true);
  assert.ok(created.webhookSecret?.startsWith('whsec_'));
  assert.equal(svc.getWatch(created.watch.watchId, 'wrong-token'), null);
  assert.ok(svc.getWatch(created.watch.watchId, created.readToken));

  await svc.pollAllActive();

  const updated = svc.getWatch(created.watch.watchId, created.readToken);
  assert.equal(updated?.status, 'CONFIRMED');
  assert.equal(updated?.confirmations, 1);
  assert.equal(receivedWebhooks.length, 1);
  assert.equal(receivedWebhooks[0].headers['X-SovRoute-Watchtower-Event'], 'CONFIRMED');
  const expectedSig = signWatchtowerPayload(receivedWebhooks[0].body, created.webhookSecret!);
  assert.equal(receivedWebhooks[0].headers['X-SovRoute-Watchtower-Signature'], expectedSig);
});

test('BtcWatchtowerService detects DROPPED_OR_REPLACED when mempool tx vanishes without confirming', async () => {
  let probeCall = 0;
  const mockNodeTruth = {
    checkRbfShield: async () => {
      probeCall++;
      if (probeCall === 1) {
        return {
          isInMempool: true,
          bip125Replaceable: true,
          hasConflicts: false,
          confirmations: 0,
          feeRateSatPerVb: 5,
          zeroConfRiskLevel: 'HIGH_RISK_RBF_ENABLED',
          recommendation: 'RBF enabled',
        };
      }
      return {
        isInMempool: false,
        bip125Replaceable: false,
        hasConflicts: false,
        confirmations: 0,
        feeRateSatPerVb: 0,
        zeroConfRiskLevel: 'NOT_FOUND',
        recommendation: 'Not found',
      };
    },
  } as any;

  const svc = new BtcWatchtowerService(mockNodeTruth);
  const created = await svc.createWatch({
    txid: TXID,
    ttlHours: 12,
    confirmationsTarget: 1,
  });

  await svc.pollAllActive();

  const updated = svc.getWatch(created.watch.watchId, created.readToken);
  assert.equal(updated?.status, 'DROPPED_OR_REPLACED');
  assert.ok(updated?.events.some((e) => e.type === 'DROPPED_OR_REPLACED'));
});
