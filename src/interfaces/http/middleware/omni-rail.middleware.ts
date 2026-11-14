import { Request, Response, NextFunction } from 'express';
import { L402Service } from '../../../application/services/l402.service.js';
import {
  BASE_PAY_TO_ADDRESS,
  BASE_USDC_CONTRACT,
  parseSafeUintBigInt,
  verifyAndSettleX402Payment,
} from './l402.middleware.js';
import {
  acquireUnfulfilledPaymentRecovery,
  attachPostPaymentFailureGuard,
  tryHandleRetryVoucherHeader,
} from './retry-voucher.helper.js';

export const SOLANA_PAY_TO_ADDRESS =
  process.env.SOLANA_PAY_TO_ADDRESS || 'J7gD37zihrYnq7gcMU3ywTFP1G5UAU9SfSNpxfQBKFs7';
export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const SOLANA_USDC_MINT =
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_NATIVE_MINT =
  'So11111111111111111111111111111111111111112';

export interface EvmChainConfig {
  chainId: string;
  hexChainId: string;
  name: string;
  rpcUrl: string;
  usdcContract: string;
  nativeSymbol: string;
}

export const SUPPORTED_EVM_CHAINS: Record<string, EvmChainConfig> = {
  'eip155:8453': {
    chainId: 'eip155:8453',
    hexChainId: '0x2105',
    name: 'Base Mainnet',
    rpcUrl: 'https://mainnet.base.org',
    usdcContract: BASE_USDC_CONTRACT,
    nativeSymbol: 'ETH',
  },
  'eip155:59144': {
    chainId: 'eip155:59144',
    hexChainId: '0xe708',
    name: 'Linea Mainnet',
    rpcUrl: 'https://rpc.linea.build',
    usdcContract: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
    nativeSymbol: 'ETH',
  },
  'eip155:42161': {
    chainId: 'eip155:42161',
    hexChainId: '0xa4b1',
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    usdcContract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    nativeSymbol: 'ETH',
  },
  'eip155:10': {
    chainId: 'eip155:10',
    hexChainId: '0xa',
    name: 'Optimism Mainnet',
    rpcUrl: 'https://mainnet.optimism.io',
    usdcContract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    nativeSymbol: 'ETH',
  },
  'eip155:137': {
    chainId: 'eip155:137',
    hexChainId: '0x89',
    name: 'Polygon PoS',
    rpcUrl: 'https://polygon-rpc.com',
    usdcContract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    nativeSymbol: 'POL',
  },
  'eip155:1': {
    chainId: 'eip155:1',
    hexChainId: '0x1',
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    usdcContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    nativeSymbol: 'ETH',
  },
};

export interface OmniRailOptions {
  priceSats: number;
  priceUsdcAtomic: string; // 6-decimal atomic integer string (e.g. "2000" = $0.002)
  priceSolLamports: string; // integer lamports string (e.g. "10000" = 0.00001 SOL)
  priceEthWei: string; // integer wei string (e.g. "300000000000" = 300 Gwei)
  priceUsdDisplay: string;
  resourceName: string;
  description: string;
}

export const OMNI_RAIL_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-Payment, Payment-Signature, X-Solana-Payment, X-EVM-Payment, X-Payment-Retry-Voucher, X-Retry-Voucher',
  'Access-Control-Expose-Headers':
    'WWW-Authenticate, Payment-Required, X-Payment-Requirements, Payment-Response, X-Payment-Rail, X-Payment-Retry-Voucher',
};

const consumedProofSet = new Set<string>();
const inFlightProofSet = new Set<string>();

function decodeJsonHeader(rawHeader: string | undefined): any | null {
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
    return null;
  }
  return null;
}

async function verifyEvmOnChainTx(
  rpcUrl: string,
  txHash: string,
  expectedRecipient: string,
  minWei: bigint
): Promise<{ valid: boolean; from?: string; valueWei?: string; blockNumber?: number; reason?: string }> {
  try {
    const [txRes, receiptRes] = await Promise.all([
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [txHash] }),
      }),
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: [txHash] }),
      }),
    ]);

    const txJson: any = await txRes.json();
    const receiptJson: any = await receiptRes.json();
    const tx = txJson?.result;
    const receipt = receiptJson?.result;

    if (!tx) {
      return { valid: false, reason: 'Transaction not found on EVM RPC yet (wait 2s for propagation).' };
    }
    if (receipt && receipt.status !== '0x1') {
      return { valid: false, reason: 'Transaction reverted on-chain.' };
    }

    const toAddr = (tx.to || '').toLowerCase();
    const expectedLower = expectedRecipient.toLowerCase();

    if (toAddr !== expectedLower) {
      return {
        valid: false,
        reason: `Recipient mismatch: tx sent to ${tx.to}, expected ${expectedRecipient}`,
      };
    }

    const valueBig = BigInt(tx.value || '0x0');
    if (valueBig < minWei) {
      return {
        valid: false,
        reason: `Insufficient on-chain value: sent ${valueBig.toString()} wei, required ${minWei.toString()} wei`,
      };
    }

    return {
      valid: true,
      from: tx.from,
      valueWei: valueBig.toString(),
      blockNumber: receipt?.blockNumber ? parseInt(receipt.blockNumber, 16) : undefined,
    };
  } catch (err: any) {
    return { valid: false, reason: `EVM RPC verification error: ${err.message}` };
  }
}

async function verifySolanaOnChainTx(
  txSignature: string,
  expectedRecipient: string
): Promise<{ valid: boolean; slot?: number; feeLamports?: number; reason?: string }> {
  try {
    const res = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          txSignature,
          { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
        ],
      }),
    });
    const data: any = await res.json();
    const tx = data?.result;
    if (!tx) {
      return { valid: false, reason: 'Solana transaction not found or not yet confirmed on Mainnet.' };
    }
    if (tx.meta?.err) {
      return { valid: false, reason: 'Solana transaction failed on-chain.' };
    }

    const accountKeys: string[] = (tx.transaction?.message?.accountKeys || []).map((k: any) =>
      typeof k === 'string' ? k : k.pubkey
    );

    if (!accountKeys.includes(expectedRecipient)) {
      return {
        valid: false,
        reason: `Solana transaction does not involve treasury address ${expectedRecipient}.`,
      };
    }

    return {
      valid: true,
      slot: tx.slot,
      feeLamports: tx.meta?.fee,
    };
  } catch (err: any) {
    return { valid: false, reason: `Solana Mainnet RPC error: ${err.message}` };
  }
}

function resolveEvmRailLabel(
  chainConfig: EvmChainConfig,
  networkId: string,
  isNativeAsset: boolean,
  isOnChain: boolean
): string {
  const upperName = chainConfig.name.toUpperCase().replace(/\s+/g, '-');
  if (isOnChain) {
    return `RAIL-4:EVM-${upperName}-ONCHAIN-VERIFIED`;
  }
  return networkId === 'eip155:8453' && !isNativeAsset
    ? 'RAIL-2:BASE-X402-USDC'
    : `RAIL-4:EVM-${upperName}-${isNativeAsset ? chainConfig.nativeSymbol : 'USDC'}`;
}

export function createOmniRailMiddleware(
  l402Service: L402Service,
  options: OmniRailOptions
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(OMNI_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }

    if (tryHandleRetryVoucherHeader(req, res, next, options.priceSats)) {
      return;
    }

    const host = req.get('host') || 'node.sovroute.com';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const fullResourceUrl = `${proto}://${host}${req.originalUrl || req.path}`;

    // =========================================================================
    // RAIL 1: Native Bitcoin Lightning (L402)
    // =========================================================================
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('L402 ')) {
      const verification = await l402Service.verifyAuthorizationHeader(
        authHeader,
        options.priceSats
      );
      if (verification.isValid) {
        (req as any).l402 = verification;
        (req as any).paymentRail = 'RAIL-1:L402-LIGHTNING-SATS';
        res.setHeader('X-Payment-Rail', 'RAIL-1:L402-LIGHTNING-SATS');
        attachPostPaymentFailureGuard(res, {
          replayKey: `omni-l402:${verification.paymentHash || authHeader}`,
          priceSats: options.priceSats,
          rail: 'RAIL-1:L402-LIGHTNING-SATS',
        });
        return next();
      }
      return res.status(402).json({
        error: 'L402 Lightning Verification Failed',
        details: verification.errorReason,
        rail: 'RAIL-1:L402-LIGHTNING',
      });
    }

    // =========================================================================
    // RAIL 3: Solana Mainnet (SPL USDC or Native SOL)
    // =========================================================================
    const rawSolanaHeader = req.header('x-solana-payment');
    const rawGenericHeader = req.header('payment-signature') || req.header('x-payment');
    const parsedSolana =
      decodeJsonHeader(rawSolanaHeader) ||
      (() => {
        const g = decodeJsonHeader(rawGenericHeader);
        return g && typeof g.network === 'string' && g.network.startsWith('solana:') ? g : null;
      })();

    if (
      rawSolanaHeader !== undefined &&
      (!parsedSolana || typeof parsedSolana !== 'object' || Array.isArray(parsedSolana))
    ) {
      return res.status(402).json({
        error: 'Solana Payment Verification Failed',
        details: 'Malformed Solana payment payload.',
        rail: 'RAIL-3:SOLANA',
      });
    }

    if (parsedSolana) {
      const payload =
        parsedSolana.payload &&
        typeof parsedSolana.payload === 'object' &&
        !Array.isArray(parsedSolana.payload)
          ? parsedSolana.payload
          : parsedSolana;
      const recipient = payload.to || payload.payTo || payload.recipient || SOLANA_PAY_TO_ADDRESS;
      const asset = payload.asset || SOLANA_USDC_MINT;
      const signature = payload.signature || payload.txSignature;

      if (!signature || typeof signature !== 'string' || typeof recipient !== 'string' || recipient !== SOLANA_PAY_TO_ADDRESS) {
        return res.status(402).json({
          error: 'Solana Payment Verification Failed',
          details: 'Invalid recipient address or missing Solana transaction signature.',
          rail: 'RAIL-3:SOLANA',
        });
      }

      const replayKey = `solana:${signature}`;
      if (inFlightProofSet.has(replayKey)) {
        return res.status(402).json({
          error: 'Solana Replay Rejected',
          details: 'This Solana payment signature has already been consumed.',
          rail: 'RAIL-3:SOLANA',
        });
      }

      const isNativeSol = asset === 'SOL' || asset === SOLANA_NATIVE_MINT;

      // If verifyOnChain is true (live wallet mode), verify directly against Solana Mainnet RPC
      if (payload.verifyOnChain === true) {
        if (consumedProofSet.has(replayKey)) {
          const recovery = acquireUnfulfilledPaymentRecovery(replayKey, options.priceSats);
          if (recovery.recovered) {
            const railLabel = 'RAIL-3:SOLANA-MAINNET-ONCHAIN-VERIFIED';
            res.setHeader('X-Payment-Rail', railLabel);
            (req as any).paymentRail = railLabel;
            attachPostPaymentFailureGuard(res, {
              replayKey,
              priceSats: options.priceSats,
              rail: railLabel,
            });
            return next();
          }
          return res.status(402).json({
            error: 'Solana Replay Rejected',
            details: 'This Solana payment signature has already been consumed.',
            rail: 'RAIL-3:SOLANA',
          });
        }

        inFlightProofSet.add(replayKey);
        try {
          const onChain = await verifySolanaOnChainTx(signature, SOLANA_PAY_TO_ADDRESS);
          if (!onChain.valid) {
            return res.status(402).json({
              error: 'Solana On-Chain RPC Verification Failed',
              details: onChain.reason,
              rail: 'RAIL-3:SOLANA',
            });
          }
          consumedProofSet.add(replayKey);
          const railLabel = 'RAIL-3:SOLANA-MAINNET-ONCHAIN-VERIFIED';
          res.setHeader('X-Payment-Rail', railLabel);
          (req as any).paymentRail = railLabel;
          (req as any).onChainReceipt = { txSignature: signature, slot: onChain.slot };
          attachPostPaymentFailureGuard(res, {
            replayKey,
            priceSats: options.priceSats,
            rail: railLabel,
          });
          return next();
        } finally {
          inFlightProofSet.delete(replayKey);
        }
      }

      const requiredAtomic = BigInt(isNativeSol ? options.priceSolLamports : options.priceUsdcAtomic);
      const paidAtomic = parseSafeUintBigInt(payload.amount ?? payload.value);

      if (paidAtomic === null || paidAtomic < requiredAtomic) {
        return res.status(402).json({
          error: 'Solana Insufficient Payment Amount',
          details: `Required ${requiredAtomic.toString()} atomic units, received ${paidAtomic === null ? 'invalid' : paidAtomic.toString()}.`,
          rail: 'RAIL-3:SOLANA',
        });
      }

      if (consumedProofSet.has(replayKey)) {
        const recovery = acquireUnfulfilledPaymentRecovery(replayKey, options.priceSats);
        if (recovery.recovered) {
          const railLabel = isNativeSol ? 'RAIL-3:SOLANA-NATIVE-SOL' : 'RAIL-3:SOLANA-SPL-USDC';
          res.setHeader('X-Payment-Rail', railLabel);
          (req as any).paymentRail = railLabel;
          attachPostPaymentFailureGuard(res, {
            replayKey,
            priceSats: options.priceSats,
            rail: railLabel,
          });
          return next();
        }
        return res.status(402).json({
          error: 'Solana Replay Rejected',
          details: 'This Solana payment signature has already been consumed.',
          rail: 'RAIL-3:SOLANA',
        });
      }

      consumedProofSet.add(replayKey);
      const railLabel = isNativeSol ? 'RAIL-3:SOLANA-NATIVE-SOL' : 'RAIL-3:SOLANA-SPL-USDC';
      res.setHeader('X-Payment-Rail', railLabel);
      (req as any).paymentRail = railLabel;
      attachPostPaymentFailureGuard(res, {
        replayKey,
        priceSats: options.priceSats,
        rail: railLabel,
      });
      return next();
    }

    // =========================================================================
    // RAIL 2 (Base) & RAIL 4 (Multi-EVM: Linea, Arbitrum, Optimism, Polygon, Ethereum)
    // =========================================================================
    const rawEvmHeader = req.header('x-evm-payment') || rawGenericHeader;
    if (rawEvmHeader) {
      const parsedEvm = decodeJsonHeader(rawEvmHeader);
      const networkId = parsedEvm?.network || 'eip155:8453';
      const chainConfig = SUPPORTED_EVM_CHAINS[networkId];

      if (!parsedEvm || typeof parsedEvm !== 'object' || Array.isArray(parsedEvm) || !chainConfig) {
        return res.status(402).json({
          error: 'EVM Payment Verification Failed',
          details: `Unsupported EVM network (${networkId}) or malformed payload.`,
          supportedNetworks: Object.keys(SUPPORTED_EVM_CHAINS),
        });
      }

      const auth = parsedEvm?.payload?.authorization || parsedEvm?.authorization || parsedEvm?.payload || parsedEvm;
      const signature = parsedEvm?.payload?.signature || parsedEvm?.signature || parsedEvm?.txHash;

      if (!signature || typeof signature !== 'string') {
        return res.status(402).json({
          error: 'EVM Payment Verification Failed',
          details: 'Missing transaction hash or cryptographic signature.',
        });
      }

      const replayKey = `${networkId}:${signature}`;
      if (inFlightProofSet.has(replayKey)) {
        return res.status(402).json({
          error: 'EVM Replay Rejected',
          details: 'This EVM payment proof has already been consumed.',
        });
      }

      const asset = String(auth?.asset || chainConfig.usdcContract);
      const isNativeAsset =
        asset.toUpperCase() === 'ETH' ||
        asset.toUpperCase() === 'POL' ||
        asset === '0x0000000000000000000000000000000000000000';

      // Live On-Chain RPC Verification Mode (when real MetaMask txHash is submitted)
      if (parsedEvm.verifyOnChain === true && /^0x[0-9a-fA-F]{64}$/.test(signature)) {
        if (consumedProofSet.has(replayKey)) {
          const recovery = acquireUnfulfilledPaymentRecovery(replayKey, options.priceSats);
          if (recovery.recovered) {
            const railLabel = resolveEvmRailLabel(chainConfig, networkId, isNativeAsset, true);
            res.setHeader('X-Payment-Rail', railLabel);
            (req as any).paymentRail = railLabel;
            attachPostPaymentFailureGuard(res, {
              replayKey,
              priceSats: options.priceSats,
              rail: railLabel,
            });
            return next();
          }
          return res.status(402).json({
            error: 'EVM Replay Rejected',
            details: 'This EVM payment proof has already been consumed.',
          });
        }

        inFlightProofSet.add(replayKey);
        try {
          const minWei = BigInt(options.priceEthWei);
          const onChain = await verifyEvmOnChainTx(
            chainConfig.rpcUrl,
            signature,
            BASE_PAY_TO_ADDRESS,
            minWei
          );
          if (!onChain.valid) {
            return res.status(402).json({
              error: 'EVM On-Chain RPC Verification Failed',
              details: onChain.reason,
              network: chainConfig.name,
            });
          }
          consumedProofSet.add(replayKey);
          const railLabel = resolveEvmRailLabel(chainConfig, networkId, isNativeAsset, true);
          res.setHeader('X-Payment-Rail', railLabel);
          (req as any).paymentRail = railLabel;
          (req as any).onChainReceipt = {
            txHash: signature,
            from: onChain.from,
            valueWei: onChain.valueWei,
            blockNumber: onChain.blockNumber,
          };
          attachPostPaymentFailureGuard(res, {
            replayKey,
            priceSats: options.priceSats,
            rail: railLabel,
          });
          return next();
        } finally {
          inFlightProofSet.delete(replayKey);
        }
      }

      if (
        !auth ||
        typeof auth !== 'object' ||
        Array.isArray(auth) ||
        typeof auth.to !== 'string' ||
        auth.to.toLowerCase() !== BASE_PAY_TO_ADDRESS.toLowerCase()
      ) {
        return res.status(402).json({
          error: 'EVM Payment Verification Failed',
          details: 'Invalid recipient address.',
        });
      }

      const requiredBigInt = BigInt(isNativeAsset ? options.priceEthWei : options.priceUsdcAtomic);
      const valueBigInt = parseSafeUintBigInt(auth.value ?? auth.amount);

      if (valueBigInt === null || valueBigInt < requiredBigInt) {
        return res.status(402).json({
          error: 'EVM Insufficient Payment Amount',
          details: `Required ${requiredBigInt.toString()} atomic units, received ${valueBigInt === null ? 'invalid' : valueBigInt.toString()}.`,
        });
      }

      let effectiveReplayKey = replayKey;
      if (networkId === 'eip155:8453' && !isNativeAsset) {
        if (process.env.X402_SKIP_VERIFY === 'true' && consumedProofSet.has(replayKey)) {
          const recovery = acquireUnfulfilledPaymentRecovery(replayKey, options.priceSats);
          if (!recovery.recovered) {
            return res.status(402).json({
              error: 'EVM Replay Rejected',
              details: 'This EVM payment proof has already been consumed.',
            });
          }
        } else {
          const x402Check = await verifyAndSettleX402Payment({
            parsedX402: parsedEvm,
            auth,
            signature,
            requiredAtomic: requiredBigInt,
            requiredPriceSats: options.priceSats,
            requirement: {
              scheme: 'exact',
              network: 'eip155:8453',
              amount: requiredBigInt.toString(),
              maxAmountRequired: requiredBigInt.toString(),
              resource: fullResourceUrl,
              description: options.description || options.resourceName,
              mimeType: 'application/json',
              asset: BASE_USDC_CONTRACT,
              payTo: BASE_PAY_TO_ADDRESS,
              maxTimeoutSeconds: 300,
              extra: { name: 'USD Coin', version: '2' },
            },
          });
          if (!x402Check.ok) {
            return res.status(402).json({
              error: x402Check.error,
              details: x402Check.details,
            });
          }
          effectiveReplayKey = x402Check.replayKey;
        }
      } else if (consumedProofSet.has(replayKey)) {
        const recovery = acquireUnfulfilledPaymentRecovery(replayKey, options.priceSats);
        if (!recovery.recovered) {
          return res.status(402).json({
            error: 'EVM Replay Rejected',
            details: 'This EVM payment proof has already been consumed.',
          });
        }
      }

      consumedProofSet.add(replayKey);

      const railLabel = resolveEvmRailLabel(chainConfig, networkId, isNativeAsset, false);

      res.setHeader('X-Payment-Rail', railLabel);
      (req as any).paymentRail = railLabel;
      attachPostPaymentFailureGuard(res, {
        replayKey: effectiveReplayKey,
        priceSats: options.priceSats,
        rail: railLabel,
      });
      return next();
    }

    // =========================================================================
    // Case 4: No Credentials -> Issue 4-Rail (Quad-Rail) 402 Challenge
    // =========================================================================
    try {
      const challenge = await l402Service.generateChallenge(
        options.priceSats,
        `omni:${options.resourceName}:${req.path}`
      );

      const accepts = [
        {
          rail: 1,
          scheme: 'l402',
          network: 'lightning:mainnet',
          asset: 'BTC-SATS',
          amount: String(challenge.priceSats),
          invoice: challenge.invoice,
          macaroon: challenge.macaroon,
          paymentHash: challenge.paymentHash,
          expiresAt: challenge.expiresAt,
        },
        {
          rail: 2,
          scheme: 'exact',
          network: 'eip155:8453',
          chainName: 'Base Mainnet',
          asset: BASE_USDC_CONTRACT,
          assetSymbol: 'USDC',
          amount: options.priceUsdcAtomic,
          payTo: BASE_PAY_TO_ADDRESS,
          maxTimeoutSeconds: 300,
        },
        {
          rail: 3,
          scheme: 'solana-x402',
          network: 'solana:mainnet',
          payTo: SOLANA_PAY_TO_ADDRESS,
          acceptedAssets: [
            { symbol: 'USDC', mint: SOLANA_USDC_MINT, amountAtomic: options.priceUsdcAtomic },
            { symbol: 'SOL', mint: SOLANA_NATIVE_MINT, amountLamports: options.priceSolLamports },
          ],
          maxTimeoutSeconds: 300,
        },
        {
          rail: 4,
          scheme: 'evm-multi-x402',
          networks: Object.keys(SUPPORTED_EVM_CHAINS),
          payTo: BASE_PAY_TO_ADDRESS,
          acceptedAssets: [
            { symbol: 'USDC', amountAtomic: options.priceUsdcAtomic },
            { symbol: 'ETH/POL', amountWei: options.priceEthWei },
          ],
          maxTimeoutSeconds: 300,
        },
      ];

      res.setHeader(
        'WWW-Authenticate',
        `L402 macaroon="${challenge.macaroon}", invoice="${challenge.invoice}"`
      );
      res.setHeader(
        'Payment-Required',
        Buffer.from(JSON.stringify({ x402Version: 2, price: options.priceUsdDisplay, accepts })).toString('base64')
      );
      res.setHeader('X-Payment-Requirements', 'L402-Lightning, x402-Base, x402-Solana, x402-MultiEVM');

      return res.status(402).json({
        statusCode: 402,
        protocol: 'Quad-Rail (1: Lightning L402 | 2: Base USDC | 3: Solana SOL/USDC | 4: Multi-EVM ETH/USDC)',
        x402Version: 2,
        price: options.priceUsdDisplay,
        priceSats: challenge.priceSats,
        resource: {
          url: fullResourceUrl,
          description: options.description,
          serviceName: 'Sovereign Node Engine — Quad-Rail Gateway',
        },
        accepts,
        challenge: {
          macaroon: challenge.macaroon,
          priceSats: challenge.priceSats,
          invoice: challenge.invoice,
          paymentHash: challenge.paymentHash,
          expiresAt: challenge.expiresAt,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'Failed to generate Quad-Rail 402 Challenge',
        details: err.message,
      });
    }
  };
}
