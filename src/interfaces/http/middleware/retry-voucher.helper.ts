import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

const RETRY_VOUCHER_TTL_SECONDS = 3600;
const FALLBACK_SECRET = 'sovereign-l402-dev-secret-key-32b-min';
export const MAX_TRACKED_ENTRIES = 10_000;

export interface UnfulfilledPaymentEntry {
  priceSats: number;
  txHash?: string;
  expiresAt: number;
}

export interface RetryVoucherVerifySuccess {
  valid: true;
  voucherId: string;
  priceSats: number;
  rail: string;
}

export type RetryVoucherVerifyResult = RetryVoucherVerifySuccess | { valid: false; reason: string };

export interface RetryVoucherGuardParams {
  replayKey: string;
  priceSats: number;
  rail: string;
  txHash?: string;
  secret?: string;
  voucherIdOverride?: string;
}

export const consumedVoucherIds = new Set<string>();
export const inFlightVoucherIds = new Set<string>();
export const unfulfilledPayments = new Map<string, UnfulfilledPaymentEntry>();

function resolveSecret(secret?: string): string {
  return secret || process.env.MACAROON_SECRET || FALLBACK_SECRET;
}

/** Inserts key into a Set with bounded FIFO eviction so tracking never grows unbounded. */
export function addBoundedSetEntry(set: Set<string>, key: string, maxEntries = MAX_TRACKED_ENTRIES): void {
  if (maxEntries <= 0) return;
  if (set.has(key)) set.delete(key);
  while (set.size >= maxEntries) {
    const oldest = set.values().next().value;
    if (oldest === undefined) break;
    set.delete(oldest);
  }
  set.add(key);
}

/** Stores unfulfilled payment credit with expired-TTL pruning before bounded FIFO eviction. */
export function setBoundedUnfulfilledPayment(
  replayKey: string,
  entry: UnfulfilledPaymentEntry,
  maxEntries = MAX_TRACKED_ENTRIES
): void {
  if (maxEntries <= 0) return;
  if (unfulfilledPayments.has(replayKey)) unfulfilledPayments.delete(replayKey);
  if (unfulfilledPayments.size >= maxEntries) {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [k, v] of unfulfilledPayments.entries()) {
      if (v.expiresAt < nowSec) unfulfilledPayments.delete(k);
    }
  }
  while (unfulfilledPayments.size >= maxEntries) {
    const oldest = unfulfilledPayments.keys().next().value;
    if (oldest === undefined) break;
    unfulfilledPayments.delete(oldest);
  }
  unfulfilledPayments.set(replayKey, entry);
}

/**
 * Derives a deterministic voucher ID from a payment replay key so Layer 1
 * (same-header retry) and Layer 2 (X-Payment-Retry-Voucher) share one single-use lock.
 */
export function deriveVoucherId(replayKey: string, secret?: string): string {
  return createHmac('sha256', resolveSecret(secret))
    .update(`voucher-id:${replayKey}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Mints an HMAC-SHA256 signed single-use retry voucher valid for 1 hour.
 */
export function mintRetryVoucher(params: {
  replayKey: string;
  priceSats: number;
  rail: string;
  secret?: string;
  voucherIdOverride?: string;
}): string {
  const secretKey = resolveSecret(params.secret);
  const voucherId = params.voucherIdOverride || deriveVoucherId(params.replayKey, secretKey);
  const expiresAt = Math.floor(Date.now() / 1000) + RETRY_VOUCHER_TTL_SECONDS;
  const safeRail = params.rail.replace(/[^a-zA-Z0-9:_-]/g, '_');
  const caveat = `voucher_id=${voucherId}&price_sats=${params.priceSats}&rail=${safeRail}&expires_at=${expiresAt}`;
  const signature = createHmac('sha256', secretKey).update(caveat).digest('hex');
  return Buffer.from(JSON.stringify({ caveat, voucherId, signature })).toString('base64');
}

/**
 * Verifies a base64-encoded retry voucher token: HMAC signature, expiration,
 * minimum price tier, and single-use / in-flight lock.
 */
export function verifyRetryVoucher(
  tokenBase64: string,
  requiredPriceSats: number,
  secret?: string
): RetryVoucherVerifyResult {
  let parsed: { caveat?: string; voucherId?: string; signature?: string };
  try {
    parsed = JSON.parse(Buffer.from(tokenBase64, 'base64').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed retry voucher encoding.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, reason: 'Malformed retry voucher encoding.' };
  }
  if (!parsed.caveat || !parsed.signature || typeof parsed.caveat !== 'string' || typeof parsed.signature !== 'string') {
    return { valid: false, reason: 'Retry voucher missing caveat or signature.' };
  }

  const expectedSig = createHmac('sha256', resolveSecret(secret)).update(parsed.caveat).digest('hex');
  const actualBuf = Buffer.from(parsed.signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return { valid: false, reason: 'Retry voucher HMAC signature verification failed.' };
  }

  const idMatch = parsed.caveat.match(/voucher_id=([0-9a-fA-F]+)/);
  const priceMatch = parsed.caveat.match(/price_sats=(\d+)/);
  const railMatch = parsed.caveat.match(/rail=([^&]+)/);
  const expMatch = parsed.caveat.match(/expires_at=(\d+)/);
  if (!idMatch || !priceMatch || !expMatch) {
    return { valid: false, reason: 'Retry voucher caveat missing required fields.' };
  }

  const voucherId = idMatch[1];
  if (parsed.voucherId !== undefined && parsed.voucherId !== voucherId) {
    return { valid: false, reason: 'Retry voucher ID mismatch with signed caveat.' };
  }
  const priceSats = Number(priceMatch[1]);
  const rail = railMatch ? railMatch[1] : 'UNKNOWN';
  const expiresAt = Number(expMatch[1]);

  if (!Number.isFinite(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) {
    return { valid: false, reason: 'Retry voucher has expired.' };
  }
  if (!Number.isFinite(priceSats) || priceSats < requiredPriceSats) {
    return { valid: false, reason: `Retry voucher value (${priceSats} sats) insufficient for this endpoint (required ${requiredPriceSats} sats).` };
  }
  if (consumedVoucherIds.has(voucherId)) {
    return { valid: false, reason: 'Retry voucher has already been redeemed.' };
  }
  if (inFlightVoucherIds.has(voucherId)) {
    return { valid: false, reason: 'Retry voucher is currently in flight.' };
  }

  return { valid: true, voucherId, priceSats, rail };
}

/**
 * Atomically acquires an unfulfilled payment credit for a same-header retry.
 * Marks the shared voucherId in-flight so concurrent or double-dip retries are rejected.
 */
export function acquireUnfulfilledPaymentRecovery(
  replayKey: string,
  requiredPriceSats: number,
  secret?: string
): { recovered: true; txHash?: string; voucherId: string } | { recovered: false } {
  const entry = unfulfilledPayments.get(replayKey);
  if (!entry) return { recovered: false };
  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    unfulfilledPayments.delete(replayKey);
    return { recovered: false };
  }
  if (entry.priceSats < requiredPriceSats) return { recovered: false };

  const voucherId = deriveVoucherId(replayKey, secret);
  if (consumedVoucherIds.has(voucherId)) {
    unfulfilledPayments.delete(replayKey);
    return { recovered: false };
  }
  if (inFlightVoucherIds.has(voucherId)) return { recovered: false };

  inFlightVoucherIds.add(voucherId);
  return { recovered: true, txHash: entry.txHash, voucherId };
}

/**
 * Guards a post-payment response: if downstream returns >= 500, preserves the
 * payment credit and attaches a signed single-use Retry Voucher; on < 500, burns
 * the credit permanently so neither the header nor voucher can be replayed.
 */
export function attachPostPaymentFailureGuard(res: Response, params: RetryVoucherGuardParams): void {
  const voucherId = params.voucherIdOverride || deriveVoucherId(params.replayKey, params.secret);
  const originalJson = res.json.bind(res);
  let settledByGuard = false;

  res.json = ((body?: any) => {
    if (res.statusCode >= 500) {
      settledByGuard = true;
      inFlightVoucherIds.delete(voucherId);
      consumedVoucherIds.delete(voucherId);
      setBoundedUnfulfilledPayment(params.replayKey, {
        priceSats: params.priceSats,
        txHash: params.txHash,
        expiresAt: Math.floor(Date.now() / 1000) + RETRY_VOUCHER_TTL_SECONDS,
      });
      const retryVoucher = mintRetryVoucher({
        replayKey: params.replayKey,
        priceSats: params.priceSats,
        rail: params.rail,
        secret: params.secret,
        voucherIdOverride: voucherId,
      });
      res.setHeader('X-Payment-Retry-Voucher', retryVoucher);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        body = {
          ...body,
          paymentProtected: true,
          retryVoucher,
          retryInstructions:
            'Payment preserved. Retry within 1h using the same payment header or X-Payment-Retry-Voucher header at no extra cost.',
        };
      }
    }
    return originalJson(body);
  }) as Response['json'];

  res.on('finish', () => {
    if (res.statusCode < 500) {
      addBoundedSetEntry(consumedVoucherIds, voucherId);
      unfulfilledPayments.delete(params.replayKey);
      inFlightVoucherIds.delete(voucherId);
      return;
    }
    inFlightVoucherIds.delete(voucherId);
    consumedVoucherIds.delete(voucherId);
    if (!settledByGuard && !unfulfilledPayments.has(params.replayKey)) {
      setBoundedUnfulfilledPayment(params.replayKey, {
        priceSats: params.priceSats,
        txHash: params.txHash,
        expiresAt: Math.floor(Date.now() / 1000) + RETRY_VOUCHER_TTL_SECONDS,
      });
    }
  });

  res.on('close', () => {
    if (!res.writableFinished) inFlightVoucherIds.delete(voucherId);
  });
}

/**
 * Checks for an incoming X-Payment-Retry-Voucher (or X-Retry-Voucher) header.
 * Returns true if the request was handled (either forwarded via next() or rejected with 402).
 */
export function tryHandleRetryVoucherHeader(
  req: Request,
  res: Response,
  next: NextFunction,
  priceSats: number,
  secret?: string
): boolean {
  const rawVoucher = req.header('x-payment-retry-voucher') || req.header('x-retry-voucher');
  if (!rawVoucher) return false;

  const check = verifyRetryVoucher(rawVoucher.trim(), priceSats, secret);
  if (!check.valid) {
    res.status(402).json({ error: 'Retry Voucher Verification Failed', details: check.reason, protocol: 'Retry-Voucher' });
    return true;
  }

  inFlightVoucherIds.add(check.voucherId);
  attachPostPaymentFailureGuard(res, {
    replayKey: `voucher-direct:${check.voucherId}`,
    voucherIdOverride: check.voucherId,
    priceSats: check.priceSats,
    rail: check.rail,
    secret,
  });

  (req as any).paymentRail = 'RETRY-VOUCHER-RECOVERY';
  res.setHeader('X-Payment-Rail', 'RETRY-VOUCHER-RECOVERY');
  next();
  return true;
}
