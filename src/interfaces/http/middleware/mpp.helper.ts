import { createHash } from 'crypto';

/**
 * Deterministic JSON Canonicalization Scheme (RFC 8785 / JCS)
 * Keys are sorted lexicographically, no unnecessary whitespace.
 */
export function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Base64url encode without '=' padding per RFC 4648 Section 5
 */
export function toBase64Url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64url decode accepting input with or without '=' padding
 */
export function fromBase64Url(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export interface MppLightningChallengeParams {
  id: string;
  realm: string;
  amountSats: number | string;
  invoice: string;
  paymentHash: string;
  description?: string;
  expiresAtSec: number;
  network?: 'mainnet' | 'regtest' | 'signet';
}

export interface MppUsdcChallengeParams {
  id: string;
  realm: string;
  amountAtomic: string;
  recipient: string;
  currency: string;
  description?: string;
  chainId?: number;
  expiresAtSec: number;
}

export interface ParsedMppCredential {
  isMpp: boolean;
  method?: string;
  intent?: string;
  challengeId?: string;
  preimage?: string;
  paymentHash?: string;
  usdcAuthorization?: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    signature: string;
  };
  rawToken?: any;
  error?: string;
}

/**
 * Builds the MPP Lightning Challenge string per draft-lightning-charge-00
 * WWW-Authenticate: Payment id="...", realm="...", method="lightning", intent="charge", request="...", expires="..."
 */
export function buildMppLightningChallenge(params: MppLightningChallengeParams): {
  headerValue: string;
  requestPayload: Record<string, unknown>;
  requestBase64Url: string;
} {
  const network = params.network || 'mainnet';
  const cleanHash = params.paymentHash.toLowerCase();

  const requestPayload = {
    amount: String(params.amountSats),
    currency: 'sat',
    description: params.description || 'SovRoute Sovereign Node API Call',
    methodDetails: {
      invoice: params.invoice,
      network,
      paymentHash: cleanHash,
    },
  };

  const canonicalJson = canonicalizeJson(requestPayload);
  const requestBase64Url = toBase64Url(canonicalJson);
  const expiresIso = new Date(params.expiresAtSec * 1000).toISOString();

  const headerValue = `Payment id="${params.id}", realm="${params.realm}", method="lightning", intent="charge", request="${requestBase64Url}", expires="${expiresIso}"`;

  return {
    headerValue,
    requestPayload,
    requestBase64Url,
  };
}

/**
 * Builds the MPP USDC Challenge string per draft-usdc-charge-00 / draft-evm-charge-00
 * WWW-Authenticate: Payment id="...", realm="...", method="usdc", intent="charge", request="...", expires="..."
 */
export function buildMppUsdcChallenge(params: MppUsdcChallengeParams): {
  headerValue: string;
  requestPayload: Record<string, unknown>;
  requestBase64Url: string;
} {
  const chainId = params.chainId || 8453; // Base Mainnet

  const requestPayload = {
    amount: params.amountAtomic,
    currency: params.currency,
    description: params.description || 'SovRoute Sovereign Node API Call',
    methodDetails: {
      evm: {
        chainId,
        credentialTypes: ['authorization'],
        decimals: 6,
      },
      type: 'evm',
    },
    recipient: params.recipient,
  };

  const canonicalJson = canonicalizeJson(requestPayload);
  const requestBase64Url = toBase64Url(canonicalJson);
  const expiresIso = new Date(params.expiresAtSec * 1000).toISOString();

  const headerValue = `Payment id="${params.id}", realm="${params.realm}", method="usdc", intent="charge", request="${requestBase64Url}", expires="${expiresIso}"`;

  return {
    headerValue,
    requestPayload,
    requestBase64Url,
  };
}

export const TEMPO_PATH_USD_CONTRACT = '0x20C000000000000000000000b9537d11c60E8b50';
export const TEMPO_CHAIN_ID = 4217;

export interface MppTempoChallengeParams {
  id: string;
  realm: string;
  amountAtomic: string;
  recipient: string;
  description?: string;
  expiresAtSec: number;
}

/**
 * Builds the MPP Tempo Challenge string per IETF draft-httpauth-payment-01 / mppx
 * WWW-Authenticate: Payment id="...", realm="...", method="tempo", intent="charge", request="...", expires="..."
 */
export function buildMppTempoChallenge(params: MppTempoChallengeParams): {
  headerValue: string;
  requestPayload: Record<string, unknown>;
  requestBase64Url: string;
} {
  const requestPayload = {
    amount: params.amountAtomic,
    currency: TEMPO_PATH_USD_CONTRACT,
    methodDetails: {
      chainId: TEMPO_CHAIN_ID,
    },
    recipient: params.recipient,
  };

  const canonicalJson = canonicalizeJson(requestPayload);
  const requestBase64Url = toBase64Url(canonicalJson);
  const expiresIso = new Date(params.expiresAtSec * 1000).toISOString();

  const headerValue = `Payment id="${params.id}", realm="${params.realm}", method="tempo", intent="charge", request="${requestBase64Url}", expires="${expiresIso}"`;

  return {
    headerValue,
    requestPayload,
    requestBase64Url,
  };
}

/**
 * Parses and validates an incoming Authorization: Payment <token> header
 * per draft-httpauth-payment-01, draft-lightning-charge-00 and draft-usdc-charge-00
 */
export function parseMppAuthorizationHeader(authHeader: string | undefined): ParsedMppCredential {
  if (!authHeader || typeof authHeader !== 'string') {
    return { isMpp: false };
  }

  const trimmed = authHeader.trim();
  if (!trimmed.startsWith('Payment ')) {
    return { isMpp: false };
  }

  const rawToken = trimmed.substring(8).trim();
  if (!rawToken) {
    return { isMpp: true, error: 'Empty Payment credential token' };
  }

  let decodedObj: any = null;

  // 1. Try direct JSON parsing
  if (rawToken.startsWith('{')) {
    try {
      decodedObj = JSON.parse(rawToken);
    } catch {
      // not direct JSON
    }
  }

  // 2. Try base64url or base64 decoding
  if (!decodedObj) {
    try {
      const decodedUtf8 = fromBase64Url(rawToken);
      if (decodedUtf8.trim().startsWith('{')) {
        decodedObj = JSON.parse(decodedUtf8);
      }
    } catch {
      // decoding failed
    }
  }

  // 3. Fallback: Check if token has auth-params format (e.g., id="...", credential="...")
  if (!decodedObj) {
    const credMatch = rawToken.match(/credential="([^"]+)"/);
    if (credMatch) {
      try {
        const decodedUtf8 = fromBase64Url(credMatch[1]);
        decodedObj = JSON.parse(decodedUtf8);
      } catch {
        // continue
      }
    }
  }

  if (!decodedObj || typeof decodedObj !== 'object') {
    return { isMpp: true, error: 'Failed to decode Payment credential payload' };
  }

  // Extract challenge context if present
  const challengeObj = decodedObj.challenge || {};
  const method = (challengeObj.method || decodedObj.method || '').toLowerCase();
  const intent = (challengeObj.intent || decodedObj.intent || 'charge').toLowerCase();
  const challengeId = challengeObj.id || decodedObj.challengeId || decodedObj.id;

  // Extract paymentHash from challenge.request if embedded
  let paymentHash: string | undefined;
  if (challengeObj.request && typeof challengeObj.request === 'string') {
    try {
      const reqDecoded = JSON.parse(fromBase64Url(challengeObj.request));
      if (reqDecoded?.methodDetails?.paymentHash) {
        paymentHash = String(reqDecoded.methodDetails.paymentHash).toLowerCase();
      }
    } catch {
      // ignore
    }
  }

  // Extract payload
  const payload = decodedObj.payload || decodedObj;

  // Case A: Lightning Preimage
  const preimageCandidate = payload.preimage || decodedObj.preimage;
  if (preimageCandidate && typeof preimageCandidate === 'string' && /^[0-9a-fA-F]{64}$/.test(preimageCandidate)) {
    const cleanPreimage = preimageCandidate.toLowerCase();
    const computedHash = createHash('sha256').update(Buffer.from(cleanPreimage, 'hex')).digest('hex');

    return {
      isMpp: true,
      method: method || 'lightning',
      intent,
      challengeId,
      preimage: cleanPreimage,
      paymentHash: paymentHash || computedHash,
      rawToken: decodedObj,
    };
  }

  // Case B: EVM / USDC EIP-3009 Authorization
  const isUsdcOrEvm = method === 'usdc' || method === 'evm' || payload.type === 'authorization' || payload.signature;
  if (isUsdcOrEvm) {
    const auth = payload.authorization || payload;
    const signature = payload.signature || auth.signature;

    if (auth && signature && typeof signature === 'string') {
      return {
        isMpp: true,
        method: method || 'usdc',
        intent,
        challengeId,
        usdcAuthorization: {
          from: auth.from,
          to: auth.to,
          value: String(auth.value || auth.amount || '0'),
          validAfter: String(auth.validAfter || '0'),
          validBefore: String(auth.validBefore || '0'),
          nonce: auth.nonce,
          signature,
        },
        rawToken: decodedObj,
      };
    }
  }

  return {
    isMpp: true,
    method,
    intent,
    challengeId,
    rawToken: decodedObj,
    error: 'Unrecognized MPP credential payload structure',
  };
}

/**
 * Builds the Payment-Receipt HTTP response header value per Section 10.2
 * Payment-Receipt: <base64url(jcs(receipt))>
 */
export function buildMppPaymentReceiptHeader(receipt: {
  method: 'lightning' | 'usdc';
  challengeId: string;
  reference: string;
  status?: 'success';
  timestamp?: string;
}): string {
  const receiptObj = {
    challengeId: receipt.challengeId,
    method: receipt.method,
    reference: receipt.reference,
    status: receipt.status || 'success',
    timestamp: receipt.timestamp || new Date().toISOString(),
  };

  const canonicalJson = canonicalizeJson(receiptObj);
  return toBase64Url(canonicalJson);
}
