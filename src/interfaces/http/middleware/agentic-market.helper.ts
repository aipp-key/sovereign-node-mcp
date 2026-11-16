import crypto from 'node:crypto';
import { Request } from 'express';

/**
 * Verifies HMAC-SHA256 signature from Global Agentic Market Exchange gateway.
 *
 * Header Specs:
 * - X-AgenticMarket-Signature: t=<unix>,v1=<hex_sha256>
 * - X-AgenticMarket-Timestamp: <unix_seconds>
 * - X-AgenticMarket-Agent-ID:  <uuid>
 *
 * Security Features:
 * - Constant-time comparison (crypto.timingSafeEqual) against timing attacks
 * - Replay attack prevention: rejects requests outside a 300s (5-minute) drift window
 * - Strict HMAC-SHA256 authentication using the pre-shared AGENTIC_MARKET_SECRET
 */
export function verifyAgenticMarketSignature(
  req: Request,
  secret: string = process.env.AGENTIC_MARKET_SECRET || ''
): { isValid: boolean; reason?: string } {
  if (!secret) {
    return { isValid: false, reason: 'AGENTIC_MARKET_SECRET not configured' };
  }

  const sigHeader = req.header('x-agenticmarket-signature');
  const tsHeader = req.header('x-agenticmarket-timestamp');

  if (!sigHeader || !tsHeader) {
    return { isValid: false, reason: 'Missing signature or timestamp header' };
  }

  // 1. Validate timestamp
  const ts = parseInt(tsHeader, 10);
  if (isNaN(ts) || !Number.isSafeInteger(ts)) {
    return { isValid: false, reason: 'Malformed timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    return { isValid: false, reason: 'Signature expired (replay protection)' };
  }

  // 2. Parse signature parts (e.g. "t=1700000000,v1=abcdef...")
  const parts: Record<string, string> = {};
  for (const item of sigHeader.split(',')) {
    const [k, v] = item.split('=', 2);
    if (k && v) {
      parts[k.trim()] = v.trim();
    }
  }

  const v1 = parts['v1'];
  if (!v1 || !/^[0-9a-fA-F]{64}$/.test(v1)) {
    return { isValid: false, reason: 'Missing or malformed v1 signature part' };
  }

  // 3. Compute expected HMAC
  // Payload is raw body buffer or string if available
  let rawBody: Buffer = Buffer.alloc(0);
  if (Buffer.isBuffer((req as any).rawBody)) {
    rawBody = (req as any).rawBody;
  } else if (typeof req.body === 'string') {
    rawBody = Buffer.from(req.body, 'utf8');
  } else if (req.body && typeof req.body === 'object') {
    rawBody = Buffer.from(JSON.stringify(req.body), 'utf8');
  }

  const prefix = Buffer.from(`${ts}.`, 'utf8');
  const message = Buffer.concat([prefix, rawBody]);

  const expectedHex = crypto.createHmac('sha256', secret).update(message).digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const receivedBuf = Buffer.from(v1.toLowerCase(), 'utf8');

  if (expectedBuf.length !== receivedBuf.length) {
    return { isValid: false, reason: 'Signature length mismatch' };
  }

  const isValid = crypto.timingSafeEqual(expectedBuf, receivedBuf);
  return isValid ? { isValid: true } : { isValid: false, reason: 'Cryptographic signature mismatch' };
}
