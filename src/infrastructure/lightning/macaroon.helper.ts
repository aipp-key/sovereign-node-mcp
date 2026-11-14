import { createHmac, timingSafeEqual } from 'crypto';

export interface MacaroonVerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verifies an L402 macaroon's HMAC-SHA256 signature using constant-time comparison,
 * checks expiration, and enforces minimum price_sats when provided.
 */
export function verifyL402Macaroon(
  macaroonBase64: string,
  secretKey: string,
  expectedPriceSats?: number
): MacaroonVerifyResult {
  let parsed: { caveat?: string; paymentHash?: string; signature?: string };
  try {
    parsed = JSON.parse(Buffer.from(macaroonBase64, 'base64').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed macaroon encoding.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, reason: 'Malformed macaroon encoding.' };
  }

  if (!parsed.caveat || !parsed.signature || typeof parsed.caveat !== 'string' || typeof parsed.signature !== 'string') {
    return { valid: false, reason: 'Macaroon missing caveat or signature.' };
  }

  const expectedSig = createHmac('sha256', secretKey).update(parsed.caveat).digest('hex');
  const actualBuf = Buffer.from(parsed.signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return { valid: false, reason: 'Macaroon HMAC signature verification failed.' };
  }

  const hashMatch = parsed.caveat.match(/payment_hash=([0-9a-fA-F]{64})/);
  if (!hashMatch) {
    return { valid: false, reason: 'Macaroon caveat missing valid payment_hash.' };
  }
  if (
    parsed.paymentHash !== undefined &&
    (typeof parsed.paymentHash !== 'string' ||
      parsed.paymentHash.toLowerCase() !== hashMatch[1].toLowerCase())
  ) {
    return { valid: false, reason: 'Macaroon paymentHash mismatch with signed caveat.' };
  }

  const expMatch = parsed.caveat.match(/expires_at=(\d+)/);
  if (expMatch) {
    const expiresAt = Number(expMatch[1]);
    if (Number.isFinite(expiresAt) && Math.floor(Date.now() / 1000) > expiresAt) {
      return { valid: false, reason: 'Macaroon has expired.' };
    }
  }

  if (expectedPriceSats !== undefined) {
    const priceMatch = parsed.caveat.match(/price_sats=(\d+)/);
    if (!priceMatch || Number(priceMatch[1]) < expectedPriceSats) {
      return {
        valid: false,
        reason: `Macaroon price_sats insufficient for this endpoint (required ${expectedPriceSats} sats).`,
      };
    }
  }

  return { valid: true };
}
