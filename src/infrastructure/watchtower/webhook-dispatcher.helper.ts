import crypto from 'node:crypto';
import net from 'node:net';
import { WatchEvent, WebhookDeliveryLog } from '../../domain/schemas/watchtower.schema.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // CGNAT & Tailscale 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIpv4(v4);
  }
  return false;
}

/**
 * Zero-trust SSRF guard: only public HTTPS webhook URLs are accepted.
 */
export function validatePublicWebhookUrl(rawUrl: string): { ok: true; normalized: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Malformed webhook URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Webhook URL must use https:// protocol.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Webhook URL must not embed credentials.' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: 'Webhook host is blocked by SSRF policy.' };
  }

  if (net.isIPv4(host) && isPrivateIpv4(host)) {
    return { ok: false, reason: 'Private or reserved IPv4 webhook targets are blocked.' };
  }
  if (net.isIPv6(host) && isPrivateIpv6(host)) {
    return { ok: false, reason: 'Private or reserved IPv6 webhook targets are blocked.' };
  }

  return { ok: true, normalized: parsed.toString() };
}

export function signWatchtowerPayload(payloadJson: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payloadJson, 'utf8').digest('hex')}`;
}

export type WebhookFetchFn = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

export async function dispatchWatchtowerWebhook(
  webhookUrl: string,
  secret: string,
  watchId: string,
  txid: string,
  event: WatchEvent,
  fetchFn: WebhookFetchFn = (url, init) => fetch(url, init)
): Promise<WebhookDeliveryLog> {
  const body = JSON.stringify({
    watchId,
    txid,
    event,
    dispatchedAt: new Date().toISOString(),
  });
  const signature = signWatchtowerPayload(body, secret);
  const maxAttempts = 2;
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SovRoute-Watchtower/1.0',
          'X-SovRoute-Watchtower-Id': watchId,
          'X-SovRoute-Watchtower-Event': event.type,
          'X-SovRoute-Watchtower-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      lastStatus = res.status;
      if (res.ok) {
        return {
          eventType: event.type,
          delivered: true,
          httpStatus: res.status,
          attempts: attempt,
          error: null,
          attemptedAt: new Date().toISOString(),
        };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err?.message || 'Webhook delivery error';
    }
  }

  return {
    eventType: event.type,
    delivered: false,
    httpStatus: lastStatus,
    attempts: maxAttempts,
    error: lastError,
    attemptedAt: new Date().toISOString(),
  };
}
