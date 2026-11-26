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
  tempoTxHash?: string;
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

  // Case A.5: Tempo PathUSD On-Chain Transaction Settlement
  const txHashCandidate = payload.txHash || payload.transactionHash || payload.hash || decodedObj.txHash;
  if (
    (method === 'tempo' || !method) &&
    typeof txHashCandidate === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(txHashCandidate.trim())
  ) {
    return {
      isMpp: true,
      method: 'tempo',
      intent,
      challengeId,
      tempoTxHash: txHashCandidate.trim().toLowerCase(),
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
  method: 'lightning' | 'usdc' | 'tempo';
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

const TEMPO_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const DEFAULT_TEMPO_RPC = 'https://rpc.tempo.xyz';

export async function verifyTempoSettlementOnChain(params: {
  txHash: string;
  requiredAtomic: bigint;
  recipient: string;
  rpcUrl?: string;
}): Promise<{ ok: true; payer: string; amountAtomic: string } | { ok: false; error: string; transient?: boolean }> {
  const rpcUrl = params.rpcUrl?.trim() || process.env.TEMPO_RPC_URL?.trim() || DEFAULT_TEMPO_RPC;
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [params.txHash],
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Tempo RPC returned HTTP ${res.status}`,
        transient: res.status >= 500 || res.status === 429,
      };
    }
    const rpc = (await res.json()) as {
      result?: {
        status?: string;
        from?: string;
        logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
      } | null;
    };
    const receipt = rpc?.result;
    if (!receipt) {
      return { ok: false, error: 'Tempo transaction receipt not found or pending.' };
    }
    if (receipt.status !== '0x1') {
      return { ok: false, error: 'Tempo transaction reverted on-chain.' };
    }
    const targetAddr = params.recipient.replace(/^0x/i, '').toLowerCase();
    for (const log of receipt.logs ?? []) {
      if (log.address?.toLowerCase() !== TEMPO_PATH_USD_CONTRACT.toLowerCase()) continue;
      if (log.topics?.[0]?.toLowerCase() !== TEMPO_TRANSFER_TOPIC) continue;
      const topicTo = log.topics?.[2]?.toLowerCase();
      if (!topicTo || !topicTo.endsWith(targetAddr)) continue;
      const rawVal = log.data ? BigInt(log.data) : 0n;
      if (rawVal >= params.requiredAtomic) {
        const topicFrom = log.topics?.[1]?.toLowerCase();
        const payer =
          topicFrom && topicFrom.length >= 42 ? `0x${topicFrom.slice(-40)}` : String(receipt.from || 'tempo-agent');
        return { ok: true, payer, amountAtomic: rawVal.toString() };
      }
    }
    return {
      ok: false,
      error: `No matching PathUSD Transfer log >= ${params.requiredAtomic.toString()} to ${params.recipient}.`,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Tempo RPC request failed: ${err?.message || 'timeout'}`,
      transient: true,
    };
  }
}
