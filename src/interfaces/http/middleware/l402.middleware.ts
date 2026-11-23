import { Request, Response, NextFunction } from 'express';
import { createPublicClient, http, parseAbi, verifyTypedData, isAddress } from 'viem';
import { base } from 'viem/chains';
import { L402Service } from '../../../application/services/l402.service.js';
import {
  acquireUnfulfilledPaymentRecovery,
  addBoundedSetEntry,
  attachPostPaymentFailureGuard,
  tryHandleRetryVoucherHeader,
} from './retry-voucher.helper.js';
import { verifyAgenticMarketSignature } from './agentic-market.helper.js';
import {
  buildMppLightningChallenge,
  buildMppUsdcChallenge,
  buildMppTempoChallenge,
  parseMppAuthorizationHeader,
  buildMppPaymentReceiptHeader,
} from './mpp.helper.js';

export const BASE_PAY_TO_ADDRESS =
  process.env.BASE_PAY_TO_ADDRESS || '0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784';
export const BASE_USDC_CONTRACT =
  process.env.BASE_USDC_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const CIRCLE_GATEWAY_CONTRACT =
  process.env.CIRCLE_GATEWAY_CONTRACT || '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee';
export const CIRCLE_GATEWAY_FACILITATOR_URL =
  process.env.CIRCLE_GATEWAY_FACILITATOR_URL || 'https://gateway-api.circle.com/v1/x402';
export const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || 'https://facilitator.payai.network';

const basePublicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

const USDC_BALANCE_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

const consumedX402Nonces = new Set<string>();
const inFlightX402Nonces = new Set<string>();

export function parseSafeUintBigInt(val: unknown): bigint | null {
  if (typeof val === 'bigint') {
    return val >= 0n ? val : null;
  }
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) && val >= 0 ? BigInt(val) : null;
  }
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    return BigInt(val.trim());
  }
  return null;
}

export async function verifyAndSettleX402Payment(params: {
  parsedX402: any;
  auth: any;
  signature: string;
  requiredAtomic: bigint;
  requirement: ReturnType<typeof buildX402Requirement>;
  requiredPriceSats?: number;
}): Promise<
  | { ok: true; txHash?: string; replayKey: string; recovered?: boolean; isCircleGateway?: boolean }
  | { ok: false; error: string; details: string }
> {
  const { parsedX402, auth, signature, requiredAtomic, requirement, requiredPriceSats } = params;

  if (process.env.X402_SKIP_VERIFY === 'true') {
    const fallbackId = String(auth?.nonce || signature || 'skip');
    const skipReplayKey = `${String(auth?.from || 'skip').toLowerCase()}:${fallbackId.toLowerCase()}`;
    return { ok: true, replayKey: skipReplayKey };
  }

  if (!auth.from || !isAddress(auth.from) || !isAddress(auth.to)) {
    return {
      ok: false,
      error: 'x402 Payment Verification Failed',
      details: 'Invalid payer or recipient address in EIP-3009 authorization.',
    };
  }

  if (!auth.nonce || typeof auth.nonce !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(auth.nonce)) {
    return {
      ok: false,
      error: 'x402 Payment Verification Failed',
      details: 'Missing or invalid 32-byte EIP-3009 nonce.',
    };
  }

  const replayKey = `${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = parseSafeUintBigInt(auth.validAfter ?? '0');
  const validBefore = parseSafeUintBigInt(auth.validBefore ?? '0');
  const valueBig = parseSafeUintBigInt(auth.value ?? auth.amount ?? '0');

  if (validAfter === null || validBefore === null || valueBig === null) {
    return {
      ok: false,
      error: 'x402 Payment Verification Failed',
      details: 'Invalid numeric fields in EIP-3009 authorization.',
    };
  }

  if (validAfter > nowSec || validBefore <= nowSec) {
    return {
      ok: false,
      error: 'x402 Authorization Expired',
      details: 'EIP-3009 authorization is not currently valid (validAfter/validBefore).',
    };
  }

  let sigValid = false;
  try {
    sigValid = await verifyTypedData({
      address: auth.from as `0x${string}`,
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: BASE_USDC_CONTRACT as `0x${string}`,
      },
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: auth.from as `0x${string}`,
        to: auth.to as `0x${string}`,
        value: valueBig,
        validAfter,
        validBefore,
        nonce: auth.nonce as `0x${string}`,
      },
      signature: signature as `0x${string}`,
    });
  } catch {
    sigValid = false;
  }

  if (!sigValid) {
    return {
      ok: false,
      error: 'x402 Invalid Signature',
      details: 'EIP-712 TransferWithAuthorization signature verification failed.',
    };
  }

  if (consumedX402Nonces.has(replayKey)) {
    const recovery = acquireUnfulfilledPaymentRecovery(replayKey, requiredPriceSats ?? 1);
    if (recovery.recovered) {
      return {
        ok: true,
        txHash: recovery.txHash,
        replayKey,
        recovered: true,
      };
    }
    return {
      ok: false,
      error: 'x402 Replay Rejected',
      details: 'This EIP-3009 authorization nonce has already been used.',
    };
  }

  if (inFlightX402Nonces.has(replayKey)) {
    return {
      ok: false,
      error: 'x402 Replay Rejected',
      details: 'This EIP-3009 authorization nonce is already in flight.',
    };
  }

  inFlightX402Nonces.add(replayKey);
  try {
    const isCircleGateway =
      requirement?.extra?.name === 'GatewayWalletBatched' ||
      parsedX402?.accepted?.extra?.name === 'GatewayWalletBatched' ||
      (typeof auth?.verifyingContract === 'string' &&
        auth.verifyingContract.toLowerCase() === CIRCLE_GATEWAY_CONTRACT.toLowerCase()) ||
      (typeof parsedX402?.accepted?.extra?.verifyingContract === 'string' &&
        parsedX402.accepted.extra.verifyingContract.toLowerCase() === CIRCLE_GATEWAY_CONTRACT.toLowerCase());

    if (!isCircleGateway) {
      try {
        const balance = await basePublicClient.readContract({
          address: BASE_USDC_CONTRACT as `0x${string}`,
          abi: USDC_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [auth.from as `0x${string}`],
        });
        if (balance < requiredAtomic) {
          return {
            ok: false,
            error: 'x402 Insufficient Base USDC Balance',
            details: `Payer ${auth.from} has ${balance.toString()} atomic USDC on Base Mainnet; ${requiredAtomic.toString()} required.`,
          };
        }
      } catch (err: any) {
        return {
          ok: false,
          error: 'x402 Balance Check Failed',
          details: err?.message || 'Unable to verify Base Mainnet USDC balance.',
        };
      }
    }

    try {
      const cleanRequirement = {
        scheme: requirement.scheme,
        network: requirement.network,
        amount: requirement.amount,
        asset: requirement.asset,
        payTo: requirement.payTo,
        maxTimeoutSeconds: requirement.maxTimeoutSeconds,
        extra: requirement.extra,
      };

      const normalizedPayload = {
        x402Version: 2,
        resource: parsedX402.resource || {
          url: requirement.resource,
          description: requirement.description,
          mimeType: requirement.mimeType,
        },
        accepted: cleanRequirement,
        payload: parsedX402.payload || { authorization: auth, signature },
      };

      const facilitatorEndpoint = isCircleGateway
        ? `${CIRCLE_GATEWAY_FACILITATOR_URL}/settle`
        : `${X402_FACILITATOR_URL}/settle`;

      const settleRes = await fetch(facilitatorEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload: normalizedPayload,
          paymentRequirements: cleanRequirement,
        }),
      });
      const settleText = await settleRes.text();
      let settleJson: any = null;
      try {
        settleJson = JSON.parse(settleText);
      } catch {
        // non-json
      }
      if (!settleRes.ok || settleJson?.success === false) {
        return {
          ok: false,
          error: isCircleGateway ? 'Circle Gateway Nanopayment Settlement Failed' : 'x402 Settlement Failed',
          details: settleJson?.error || settleJson?.errorReason || `Facilitator returned HTTP ${settleRes.status}`,
        };
      }
      addBoundedSetEntry(consumedX402Nonces, replayKey);
      return {
        ok: true,
        txHash: settleJson?.transaction || settleJson?.txHash || (isCircleGateway ? 'circle-gateway-settled' : undefined),
        replayKey,
        isCircleGateway,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: isCircleGateway ? 'Circle Gateway Nanopayment Error' : 'x402 Settlement Error',
        details: err?.message || 'Failed to settle x402 payment with facilitator.',
      };
    }
  } finally {
    inFlightX402Nonces.delete(replayKey);
  }
}

export interface L402MiddlewareOptions {
  priceSats: number;
  priceUsdcAtomic?: string; // 6-decimal integer string, e.g. "1000" = $0.001 USDC
  priceUsdDisplay?: string; // e.g. "$0.001"
  resourceName: string;
  description?: string;
  schema?: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
}

export const DUAL_RAIL_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-Payment, Payment-Signature, X-Payment-Proof, Payment-Proof, X-Payment-Retry-Voucher, X-Retry-Voucher',
  'Access-Control-Expose-Headers':
    'WWW-Authenticate, Payment-Required, Payment-Receipt, X-Payment-Requirements, Payment-Response, X-Payment-Response, X-Payment-Retry-Voucher',
};

function parseX402Header(rawHeader: string | undefined): any | null {
  if (!rawHeader || typeof rawHeader !== 'string') return null;
  const trimmed = rawHeader.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.trim().startsWith('{')) {
      return JSON.parse(decoded);
    }
  } catch {
    // Non-base64 JSON
  }

  return null;
}

function buildX402Requirement(
  resourceUrl: string,
  description: string,
  usdcAtomic: string
) {
  return {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: usdcAtomic,
    maxAmountRequired: usdcAtomic,
    resource: resourceUrl,
    description,
    mimeType: 'application/json',
    asset: BASE_USDC_CONTRACT,
    payTo: BASE_PAY_TO_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: {
      name: 'USD Coin',
      version: '2',
    },
  };
}

function buildCircleGatewayRequirement(
  resourceUrl: string,
  description: string,
  usdcAtomic: string,
  network = 'eip155:8453',
  asset = BASE_USDC_CONTRACT
) {
  return {
    scheme: 'exact',
    network,
    amount: usdcAtomic,
    maxAmountRequired: usdcAtomic,
    resource: resourceUrl,
    description,
    mimeType: 'application/json',
    asset,
    payTo: BASE_PAY_TO_ADDRESS,
    maxTimeoutSeconds: 604900,
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: CIRCLE_GATEWAY_CONTRACT,
    },
  };
}

export function createL402Middleware(
  l402Service: L402Service,
  options: L402MiddlewareOptions
) {
  // Integer atomic conversion: 1 sat tier -> 1000 atomic USDC ($0.001)
  const usdcAtomic = options.priceUsdcAtomic || String(options.priceSats * 1000);
  const usdDisplay =
    options.priceUsdDisplay || `$0.00${options.priceSats}`;
  const description =
    options.description ||
    `Sovereign Node Intelligence (${options.resourceName}) — Bare-metal Bitcoin Core v31.1 & Lightning L402/x402`;

  return async (req: Request, res: Response, next: NextFunction) => {
    for (const [key, val] of Object.entries(DUAL_RAIL_CORS_HEADERS)) {
      res.setHeader(key, val);
    }

    if (tryHandleRetryVoucherHeader(req, res, next, options.priceSats)) {
      return;
    }

    const host = req.get('x-forwarded-host') || req.get('host') || 'node.sovroute.com';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const fullResourceUrl = `${proto}://${host}${req.originalUrl || req.path}`;

    // -------------------------------------------------------------------------
    // RAIL 0: Global Agentic Market Exchange (HMAC Signature Escrow Gateway)
    // -------------------------------------------------------------------------
    if (req.header('x-agenticmarket-signature')) {
      const verification = verifyAgenticMarketSignature(req);
      if (verification.isValid) {
        (req as any).paymentRail = 'AGENTIC-MARKET-EXCHANGE';
        return next();
      }
      return res.status(401).json({
        error: 'Unauthorized: Invalid Agentic Market Signature',
        details: verification.reason,
        protocol: 'agentic-market',
      });
    }

    // -------------------------------------------------------------------------
    // RAIL 1: Native Lightning L402 (Authorization: L402 <macaroon>:<preimage>)
    // -------------------------------------------------------------------------
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('L402 ')) {
      try {
        const verification = await l402Service.verifyAuthorizationHeader(
          authHeader,
          options.priceSats
        );
        if (verification.isValid) {
          (req as any).l402 = verification;
          (req as any).paymentRail = 'L402-LIGHTNING';
          attachPostPaymentFailureGuard(res, {
            replayKey: `l402:${verification.paymentHash || authHeader}`,
            priceSats: options.priceSats,
            rail: 'L402-LIGHTNING',
          });
          return next();
        }

        return res.status(402).json({
          error: 'Payment Verification Failed',
          details: verification.errorReason,
          protocol: 'L402',
        });
      } catch (err: any) {
        return res.status(500).json({
          error: 'L402 Verification Exception',
          details: err.message,
        });
      }
    }

    // -------------------------------------------------------------------------
    // RAIL 1.5: Machine Payments Protocol (Authorization: Payment <token>)
    // Per IETF draft-httpauth-payment-01, draft-lightning-charge-00, draft-usdc-charge-00
    // -------------------------------------------------------------------------
    if (authHeader && authHeader.startsWith('Payment ')) {
      const parsedMpp = parseMppAuthorizationHeader(authHeader);

      if (!parsedMpp.isMpp || parsedMpp.error) {
        return res.status(402).json({
          error: 'MPP Payment Verification Failed',
          details: parsedMpp.error || 'Invalid MPP credential structure.',
          protocol: 'mpp',
        });
      }

      // Method A: Lightning Network Preimage Charge
      if (parsedMpp.preimage && parsedMpp.paymentHash) {
        try {
          const verification = await l402Service.verifyPreimage(
            parsedMpp.paymentHash,
            parsedMpp.preimage
          );

          if (verification.isValid) {
            const receiptHeader = buildMppPaymentReceiptHeader({
              challengeId: parsedMpp.challengeId || `ch_${parsedMpp.paymentHash.slice(0, 16)}`,
              method: 'lightning',
              reference: parsedMpp.paymentHash,
            });
            res.setHeader('Payment-Receipt', receiptHeader);
            (req as any).paymentRail = 'MPP-LIGHTNING';
            (req as any).mpp = {
              method: 'lightning',
              intent: parsedMpp.intent || 'charge',
              challengeId: parsedMpp.challengeId,
              paymentHash: parsedMpp.paymentHash,
              preimage: parsedMpp.preimage,
            };
            attachPostPaymentFailureGuard(res, {
              replayKey: `mpp:lightning:${parsedMpp.paymentHash}`,
              priceSats: options.priceSats,
              rail: 'MPP-LIGHTNING',
            });
            return next();
          }

          return res.status(402).json({
            error: 'MPP Lightning Preimage Verification Failed',
            details:
              verification.errorReason || 'Preimage does not match payment hash or invoice is unpaid.',
            protocol: 'mpp',
          });
        } catch (err: any) {
          return res.status(500).json({
            error: 'MPP Verification Exception',
            details: err.message,
          });
        }
      }

      // Method B: USDC / EVM Direct EIP-3009 Charge
      if (parsedMpp.usdcAuthorization) {
        const auth = parsedMpp.usdcAuthorization;
        const signature = auth.signature;

        const valueBigInt = parseSafeUintBigInt(auth.value);
        const requiredBigInt = BigInt(usdcAtomic);
        if (valueBigInt === null || valueBigInt < requiredBigInt) {
          return res.status(402).json({
            error: 'MPP USDC Insufficient Amount',
            details: `Required ${usdcAtomic} atomic USDC, received ${valueBigInt?.toString() || '0'}.`,
            protocol: 'mpp',
          });
        }

        const requirement = buildX402Requirement(fullResourceUrl, description, usdcAtomic);
        const x402Check = await verifyAndSettleX402Payment({
          parsedX402: { payload: { authorization: auth, signature } },
          auth,
          signature,
          requiredAtomic: requiredBigInt,
          requirement,
          requiredPriceSats: options.priceSats,
        });

        if (!x402Check.ok) {
          return res.status(402).json({
            error: x402Check.error,
            details: x402Check.details,
            protocol: 'mpp',
          });
        }

        const receiptHeader = buildMppPaymentReceiptHeader({
          challengeId: parsedMpp.challengeId || `ch_usdc_${auth.nonce.slice(0, 16)}`,
          method: 'usdc',
          reference: x402Check.txHash || auth.nonce,
        });
        res.setHeader('Payment-Receipt', receiptHeader);
        (req as any).paymentRail = 'MPP-BASE-USDC';
        attachPostPaymentFailureGuard(res, {
          replayKey: x402Check.replayKey,
          priceSats: options.priceSats,
          rail: 'MPP-BASE-USDC',
          txHash: x402Check.txHash,
        });
        return next();
      }

      return res.status(402).json({
        error: 'MPP Unrecognized Payment Method',
        details: 'Currently supported MPP methods: lightning, usdc.',
        protocol: 'mpp',
      });
    }

    // -------------------------------------------------------------------------
    // RAIL 2: Base L2 USDC x402 (Payment-Signature / X-Payment)
    // -------------------------------------------------------------------------
    const rawX402Header =
      req.header('payment-signature') ||
      req.header('x-payment') ||
      req.header('x-payment-proof') ||
      req.header('payment-proof');

    if (rawX402Header) {
      const parsedX402 = parseX402Header(rawX402Header);
      const auth = parsedX402?.payload?.authorization || parsedX402?.authorization;
      const signature = parsedX402?.payload?.signature || parsedX402?.signature;

      if (
        !parsedX402 ||
        !auth ||
        typeof auth !== 'object' ||
        Array.isArray(auth) ||
        typeof signature !== 'string' ||
        !signature ||
        typeof auth.to !== 'string' ||
        auth.to.toLowerCase() !== BASE_PAY_TO_ADDRESS.toLowerCase()
      ) {
        return res.status(402).json({
          error: 'x402 Payment Verification Failed',
          details:
            'Invalid or unsigned x402 payload, or recipient address does not match Sovereign Node treasury.',
          protocol: 'x402',
        });
      }

      const valueBigInt = parseSafeUintBigInt(auth.value ?? auth.amount);
      if (valueBigInt === null) {
        return res.status(402).json({
          error: 'x402 Payment Verification Failed',
          details: 'Invalid payment amount format.',
          protocol: 'x402',
        });
      }

      const requiredBigInt = BigInt(usdcAtomic);
      if (valueBigInt < requiredBigInt) {
        return res.status(402).json({
          error: 'x402 Insufficient Payment Amount',
          details: `Required ${usdcAtomic} atomic USDC units, received ${valueBigInt.toString()}.`,
          protocol: 'x402',
        });
      }

      const requirement = buildX402Requirement(fullResourceUrl, description, usdcAtomic);

      const x402Check = await verifyAndSettleX402Payment({
        parsedX402,
        auth,
        signature,
        requiredAtomic: requiredBigInt,
        requirement,
        requiredPriceSats: options.priceSats,
      });

      if (!x402Check.ok) {
        return res.status(402).json({
          error: x402Check.error,
          details: x402Check.details,
          protocol: 'x402',
        });
      }

      const payerAddress = auth.from || parsedX402.payer || 'x402-verified-agent';
      const settlementReceipt = Buffer.from(
        JSON.stringify({
          success: true,
          network: 'eip155:8453',
          asset: BASE_USDC_CONTRACT,
          payTo: BASE_PAY_TO_ADDRESS,
          payer: payerAddress,
          amount: usdcAtomic,
          txHash: x402Check.txHash,
          recovered: x402Check.recovered || undefined,
          timestamp: Date.now(),
        })
      ).toString('base64');

      res.setHeader('Payment-Response', settlementReceipt);
      res.setHeader('X-Payment-Response', settlementReceipt);
      const paymentRail = (x402Check as any).isCircleGateway
        ? 'X402-CIRCLE-NANOPAYMENT'
        : 'X402-BASE-USDC';
      (req as any).paymentRail = paymentRail;
      attachPostPaymentFailureGuard(res, {
        replayKey: x402Check.replayKey,
        priceSats: options.priceSats,
        rail: paymentRail,
        txHash: x402Check.txHash,
      });
      return next();
    }

    // -------------------------------------------------------------------------
    // Case 3: No credentials -> Issue Dual-Rail 402 Challenge (L402 + x402 + Circle Nanopayments)
    // -------------------------------------------------------------------------
    try {
      const challenge = await l402Service.generateChallenge(
        options.priceSats,
        `${options.resourceName}:${req.path}`
      );

      const baseUsdcRequirement = buildX402Requirement(fullResourceUrl, description, usdcAtomic);
      const polygonUsdcRequirement = {
        scheme: 'exact',
        network: 'eip155:137',
        amount: usdcAtomic,
        maxAmountRequired: usdcAtomic,
        resource: fullResourceUrl,
        description,
        mimeType: 'application/json',
        asset: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        payTo: BASE_PAY_TO_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD Coin',
          version: '2',
        },
      };
      const arbitrumUsdcRequirement = {
        scheme: 'exact',
        network: 'eip155:42161',
        amount: usdcAtomic,
        maxAmountRequired: usdcAtomic,
        resource: fullResourceUrl,
        description,
        mimeType: 'application/json',
        asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        payTo: BASE_PAY_TO_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD Coin',
          version: '2',
        },
      };
      const circleGatewayBaseRequirement = buildCircleGatewayRequirement(
        fullResourceUrl,
        description,
        usdcAtomic,
        'eip155:8453',
        BASE_USDC_CONTRACT
      );
      const circleGatewayPolygonRequirement = buildCircleGatewayRequirement(
        fullResourceUrl,
        description,
        usdcAtomic,
        'eip155:137',
        '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
      );
      const l402Requirement = {
        scheme: 'l402',
        network: 'lightning:mainnet',
        amount: String(challenge.priceSats),
        asset: 'BTC-SATS',
        payTo: BASE_PAY_TO_ADDRESS,
        maxTimeoutSeconds: 300,
        invoice: challenge.invoice,
        macaroon: challenge.macaroon,
        paymentHash: challenge.paymentHash,
        expiresAt: challenge.expiresAt,
      };

      const acceptsList = [
        baseUsdcRequirement,
        polygonUsdcRequirement,
        arbitrumUsdcRequirement,
        circleGatewayBaseRequirement,
        circleGatewayPolygonRequirement,
        l402Requirement,
      ];

      const bazaarInputSchema = options.schema?.input || { type: 'object', properties: {} };
      const bazaarOutputSchema = options.schema?.output || { type: 'object', properties: {} };

      const x402HeaderPayload = {
        x402Version: 2,
        error: 'Payment required',
        resource: {
          url: fullResourceUrl,
          description,
          mimeType: 'application/json',
          serviceName: 'Sovereign Node Engine',
          schema: options.schema,
          inputSchema: bazaarInputSchema,
          outputSchema: bazaarOutputSchema,
        },
        extensions: {
          bazaar: {
            info: { input: { type: 'http', method: req.method } },
            schema: {
              type: 'object',
              properties: {
                input: {
                  type: 'object',
                  properties: {
                    queryParams: bazaarInputSchema,
                    body: bazaarInputSchema,
                  },
                },
                output: {
                  type: 'object',
                  properties: {
                    example: bazaarOutputSchema,
                    body: bazaarOutputSchema,
                  },
                },
              },
              inputSchema: bazaarInputSchema,
              outputSchema: bazaarOutputSchema,
            },
          },
        },
        price: usdDisplay,
        protocols: ['x402', 'mpp', 'l402'],
        circleGateway: true,
        accepts: acceptsList,
      };

      const base64X402Header = Buffer.from(JSON.stringify(x402HeaderPayload)).toString('base64');

      const mppLightning = buildMppLightningChallenge({
        id: `ch_lig_${challenge.paymentHash.slice(0, 16)}`,
        realm: host,
        amountSats: challenge.priceSats,
        invoice: challenge.invoice,
        paymentHash: challenge.paymentHash,
        description,
        expiresAtSec: challenge.expiresAt,
        network: 'mainnet',
      });

      const mppUsdc = buildMppUsdcChallenge({
        id: `ch_usdc_${challenge.paymentHash.slice(0, 16)}`,
        realm: host,
        amountAtomic: usdcAtomic,
        recipient: BASE_PAY_TO_ADDRESS,
        currency: BASE_USDC_CONTRACT,
        description,
        chainId: 8453,
        expiresAtSec: challenge.expiresAt,
      });

      const mppTempo = buildMppTempoChallenge({
        id: `ch_tempo_${challenge.paymentHash.slice(0, 16)}`,
        realm: host,
        amountAtomic: usdcAtomic,
        recipient: BASE_PAY_TO_ADDRESS,
        description,
        expiresAtSec: challenge.expiresAt,
      });

      res.setHeader('WWW-Authenticate', [
        mppTempo.headerValue,
        mppLightning.headerValue,
        mppUsdc.headerValue,
        `L402 macaroon="${challenge.macaroon}", invoice="${challenge.invoice}"`,
      ]);
      res.setHeader('Payment-Required', base64X402Header);
      res.setHeader(
        'X-Payment-Requirements',
        'L402, x402, MPP (Lightning + USDC), Circle-Gateway-Nanopayments'
      );

      return res.status(402).json({
        statusCode: 402,
        protocol: 'Multi-Rail (L402 Lightning + MPP + x402 Base USDC)',
        protocols: ['x402', 'mpp', 'l402'],
        circleGateway: true,
        x402Version: 2,
        error: 'Payment required',
        message:
          'Payment Required: Settle instantly via Lightning Network (L402 / MPP BOLT-11 invoice) or Base L2 USDC (x402 / MPP).',
        price: usdDisplay,
        priceSats: challenge.priceSats,
        resource: {
          url: fullResourceUrl,
          description,
          mimeType: 'application/json',
          serviceName: 'Sovereign Node Engine',
          schema: options.schema,
          inputSchema: options.schema?.input,
          outputSchema: options.schema?.output,
        },
        schema: options.schema || {
          input: { description: 'Request payload or parameters' },
          output: { description: 'Cryptographic node response' },
        },
        inputSchema: bazaarInputSchema,
        outputSchema: bazaarOutputSchema,
        extensions: x402HeaderPayload.extensions,
        accepts: acceptsList,
        challenge: {
          macaroon: challenge.macaroon,
          priceSats: challenge.priceSats,
          invoice: challenge.invoice,
          paymentHash: challenge.paymentHash,
          expiresAt: challenge.expiresAt,
        },
        mpp: {
          spec: 'draft-httpauth-payment-01',
          lightning: {
            challenge: mppLightning.headerValue,
            request: mppLightning.requestPayload,
          },
          usdc: {
            challenge: mppUsdc.headerValue,
            request: mppUsdc.requestPayload,
          },
        },
        instructions: {
          rail1_lightning_l402:
            'Pay the BOLT-11 invoice over Lightning Network (or via Alby Hub NWC) and repeat request with header: "Authorization: L402 <macaroon>:<preimage>".',
          rail2_mpp_lightning:
            'Pay invoice via MPP and repeat request with header: "Authorization: Payment <token>" per draft-lightning-charge-00.',
          rail3_base_x402: `Sign an EIP-3009 USDC authorization on Base (eip155:8453) for ${usdDisplay} (${usdcAtomic} atomic units) to ${BASE_PAY_TO_ADDRESS} and repeat request with header: "Payment-Signature: <base64_x402_payload>".`,
          rail4_mpp_usdc:
            'Sign an EIP-3009 authorization via MPP and repeat request with header: "Authorization: Payment <token>" per draft-usdc-charge-00.',
          rail5_circle_nanopayments: `Sign a gasless Circle Gateway Nanopayment authorization against verifyingContract ${CIRCLE_GATEWAY_CONTRACT} and repeat request with header: "Payment-Signature: <base64_x402_payload>".`,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'Failed to generate Dual-Rail 402 Challenge',
        details: err.message,
      });
    }
  };
}
