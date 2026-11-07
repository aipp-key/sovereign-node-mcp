import { Request, Response, NextFunction } from 'express';
import { L402Service } from '../../../application/services/l402.service.js';
import {
  BASE_PAY_TO_ADDRESS,
  BASE_USDC_CONTRACT,
  X402_FACILITATOR_URL,
} from './l402.middleware.js';

export const SOLANA_PAY_TO_ADDRESS =
  process.env.SOLANA_PAY_TO_ADDRESS || 'SovRoute11111111111111111111111111111111111';
export const SOLANA_USDC_MINT =
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_NATIVE_MINT =
  'So11111111111111111111111111111111111111112';

export interface EvmChainConfig {
  chainId: string;
  name: string;
  usdcContract: string;
  nativeSymbol: string;
}

export const SUPPORTED_EVM_CHAINS: Record<string, EvmChainConfig> = {
  'eip155:8453': {
    chainId: 'eip155:8453',
    name: 'Base Mainnet',
    usdcContract: BASE_USDC_CONTRACT,
    nativeSymbol: 'ETH',
  },
  'eip155:42161': {
    chainId: 'eip155:42161',
    name: 'Arbitrum One',
    usdcContract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    nativeSymbol: 'ETH',
  },
  'eip155:10': {
    chainId: 'eip155:10',
    name: 'Optimism Mainnet',
    usdcContract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    nativeSymbol: 'ETH',
  },
  'eip155:137': {
    chainId: 'eip155:137',
    name: 'Polygon PoS',
    usdcContract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    nativeSymbol: 'POL',
  },
  'eip155:1': {
    chainId: 'eip155:1',
    name: 'Ethereum Mainnet',
    usdcContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    nativeSymbol: 'ETH',
  },
};

export interface OmniRailOptions {
  priceSats: number;
  priceUsdcAtomic: string; // 6-decimal atomic integer string (e.g. "2000" = $0.002)
  priceSolLamports: string; // integer lamports string (e.g. "10000" = 0.00001 SOL)
  priceEthWei: string; // integer wei string (e.g. "600000000000" = 600 Gwei)
  priceUsdDisplay: string;
  resourceName: string;
  description: string;
}

export const OMNI_RAIL_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-Payment, Payment-Signature, X-Solana-Payment, X-EVM-Payment',
  'Access-Control-Expose-Headers':
    'WWW-Authenticate, Payment-Required, X-Payment-Requirements, Payment-Response, X-Payment-Rail',
};

// In-memory anti-replay ledger for Solana and Multi-EVM proofs
const consumedProofSet = new Set<string>();

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

export function createOmniRailMiddleware(
  l402Service: L402Service,
  options: OmniRailOptions
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const [k, v] of Object.entries(OMNI_RAIL_CORS_HEADERS)) {
      res.setHeader(k, v);
    }

    const host = req.get('host') || 'node.sovroute.com';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const fullResourceUrl = `${proto}://${host}${req.originalUrl || req.path}`;

    // =========================================================================
    // RAIL 1: Native Bitcoin Lightning (L402)
    // =========================================================================
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('L402 ')) {
      const verification = await l402Service.verifyAuthorizationHeader(authHeader);
      if (verification.isValid) {
        (req as any).l402 = verification;
        (req as any).paymentRail = 'RAIL-1:L402-LIGHTNING-SATS';
        res.setHeader('X-Payment-Rail', 'RAIL-1:L402-LIGHTNING-SATS');
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
    const rawGenericHeader =
      req.header('payment-signature') || req.header('x-payment');
    const parsedSolana =
      decodeJsonHeader(rawSolanaHeader) ||
      (() => {
        const g = decodeJsonHeader(rawGenericHeader);
        return g && typeof g.network === 'string' && g.network.startsWith('solana:') ? g : null;
      })();

    if (parsedSolana) {
      const payload = parsedSolana.payload || parsedSolana;
      const recipient = payload.to || payload.payTo || payload.recipient;
      const asset = payload.asset || SOLANA_USDC_MINT;
      const signature = payload.signature || payload.txSignature;
      const rawAmount = String(payload.amount ?? payload.value ?? '0');

      if (!recipient || recipient !== SOLANA_PAY_TO_ADDRESS || !signature || typeof signature !== 'string') {
        return res.status(402).json({
          error: 'Solana Payment Verification Failed',
          details: 'Invalid recipient address or missing Solana transaction/authorization signature.',
          rail: 'RAIL-3:SOLANA',
        });
      }

      const replayKey = `solana:${signature}`;
      if (consumedProofSet.has(replayKey)) {
        return res.status(402).json({
          error: 'Solana Replay Rejected',
          details: 'This Solana payment signature has already been consumed.',
          rail: 'RAIL-3:SOLANA',
        });
      }

      const isNativeSol = asset === 'SOL' || asset === SOLANA_NATIVE_MINT;
      const requiredAtomic = BigInt(
        isNativeSol ? options.priceSolLamports : options.priceUsdcAtomic
      );
      let paidAtomic = 0n;
      try {
        paidAtomic = BigInt(rawAmount);
      } catch {
        paidAtomic = 0n;
      }

      if (paidAtomic < requiredAtomic) {
        return res.status(402).json({
          error: 'Solana Insufficient Payment Amount',
          details: `Required ${requiredAtomic.toString()} atomic units (${isNativeSol ? 'lamports' : 'micro-USDC'}), received ${paidAtomic.toString()}.`,
          rail: 'RAIL-3:SOLANA',
        });
      }

      consumedProofSet.add(replayKey);
      const railLabel = isNativeSol ? 'RAIL-3:SOLANA-NATIVE-SOL' : 'RAIL-3:SOLANA-SPL-USDC';
      const receipt = Buffer.from(
        JSON.stringify({
          success: true,
          rail: railLabel,
          network: 'solana:mainnet',
          asset: isNativeSol ? 'SOL' : SOLANA_USDC_MINT,
          payTo: SOLANA_PAY_TO_ADDRESS,
          amount: paidAtomic.toString(),
          signature,
          timestamp: Date.now(),
        })
      ).toString('base64');

      res.setHeader('Payment-Response', receipt);
      res.setHeader('X-Payment-Rail', railLabel);
      (req as any).paymentRail = railLabel;
      return next();
    }

    // =========================================================================
    // RAIL 2 (Base USDC) & RAIL 4 (Multi-EVM: Arbitrum, Optimism, Polygon, Ethereum)
    // =========================================================================
    const rawEvmHeader = req.header('x-evm-payment') || rawGenericHeader;
    if (rawEvmHeader) {
      const parsedEvm = decodeJsonHeader(rawEvmHeader);
      const networkId = parsedEvm?.network || 'eip155:8453';
      const chainConfig = SUPPORTED_EVM_CHAINS[networkId];

      if (!parsedEvm || !chainConfig) {
        return res.status(402).json({
          error: 'EVM Payment Verification Failed',
          details: `Unsupported EVM network (${networkId}) or malformed payload.`,
          supportedNetworks: Object.keys(SUPPORTED_EVM_CHAINS),
        });
      }

      const auth = parsedEvm?.payload?.authorization || parsedEvm?.authorization || parsedEvm?.payload;
      const signature =
        parsedEvm?.payload?.signature || parsedEvm?.signature || parsedEvm?.txHash;

      if (
        !auth ||
        !signature ||
        typeof auth.to !== 'string' ||
        auth.to.toLowerCase() !== BASE_PAY_TO_ADDRESS.toLowerCase()
      ) {
        return res.status(402).json({
          error: 'EVM Payment Verification Failed',
          details: 'Invalid recipient address or missing cryptographic signature.',
          rail: networkId === 'eip155:8453' ? 'RAIL-2:BASE-X402' : `RAIL-4:EVM-${chainConfig.name}`,
        });
      }

      const replayKey = `${networkId}:${signature}`;
      if (consumedProofSet.has(replayKey)) {
        return res.status(402).json({
          error: 'EVM Replay Rejected',
          details: 'This EVM payment signature has already been consumed.',
        });
      }

      const asset = String(auth.asset || chainConfig.usdcContract);
      const isNativeAsset =
        asset.toUpperCase() === 'ETH' ||
        asset.toUpperCase() === 'POL' ||
        asset === '0x0000000000000000000000000000000000000000';

      const requiredBigInt = BigInt(
        isNativeAsset ? options.priceEthWei : options.priceUsdcAtomic
      );
      let valueBigInt = 0n;
      try {
        valueBigInt = BigInt(auth.value ?? auth.amount ?? '0');
      } catch {
        valueBigInt = 0n;
      }

      if (valueBigInt < requiredBigInt) {
        return res.status(402).json({
          error: 'EVM Insufficient Payment Amount',
          details: `Required ${requiredBigInt.toString()} atomic units, received ${valueBigInt.toString()}.`,
        });
      }

      consumedProofSet.add(replayKey);

      if (networkId === 'eip155:8453' && !isNativeAsset) {
        fetch(`${X402_FACILITATOR_URL}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x402Version: 2,
            paymentPayload: parsedEvm,
          }),
        }).catch(() => null);
      }

      const railLabel =
        networkId === 'eip155:8453'
          ? 'RAIL-2:BASE-X402-USDC'
          : `RAIL-4:EVM-${chainConfig.name.toUpperCase().replace(/\s+/g, '-')}-${isNativeAsset ? chainConfig.nativeSymbol : 'USDC'}`;

      const receipt = Buffer.from(
        JSON.stringify({
          success: true,
          rail: railLabel,
          network: networkId,
          chainName: chainConfig.name,
          asset: isNativeAsset ? chainConfig.nativeSymbol : chainConfig.usdcContract,
          payTo: BASE_PAY_TO_ADDRESS,
          amount: valueBigInt.toString(),
          timestamp: Date.now(),
        })
      ).toString('base64');

      res.setHeader('Payment-Response', receipt);
      res.setHeader('X-Payment-Rail', railLabel);
      (req as any).paymentRail = railLabel;
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
        // Rail 1: Bitcoin Lightning (L402)
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
        // Rail 2: Base L2 USDC (x402 v2)
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
        // Rail 3: Solana Mainnet (SPL USDC & Native SOL)
        {
          rail: 3,
          scheme: 'solana-x402',
          network: 'solana:mainnet',
          payTo: SOLANA_PAY_TO_ADDRESS,
          acceptedAssets: [
            {
              symbol: 'USDC',
              mint: SOLANA_USDC_MINT,
              amountAtomic: options.priceUsdcAtomic,
            },
            {
              symbol: 'SOL',
              mint: SOLANA_NATIVE_MINT,
              amountLamports: options.priceSolLamports,
            },
          ],
          maxTimeoutSeconds: 300,
        },
        // Rail 4: Multi-EVM (Arbitrum, Optimism, Polygon, Ethereum Mainnet)
        {
          rail: 4,
          scheme: 'evm-multi-x402',
          networks: ['eip155:42161', 'eip155:10', 'eip155:137', 'eip155:1'],
          payTo: BASE_PAY_TO_ADDRESS,
          acceptedAssets: [
            {
              symbol: 'USDC',
              amountAtomic: options.priceUsdcAtomic,
              contracts: {
                'eip155:42161': SUPPORTED_EVM_CHAINS['eip155:42161'].usdcContract,
                'eip155:10': SUPPORTED_EVM_CHAINS['eip155:10'].usdcContract,
                'eip155:137': SUPPORTED_EVM_CHAINS['eip155:137'].usdcContract,
                'eip155:1': SUPPORTED_EVM_CHAINS['eip155:1'].usdcContract,
              },
            },
            {
              symbol: 'ETH/POL',
              amountWei: options.priceEthWei,
            },
          ],
          maxTimeoutSeconds: 300,
        },
      ];

      const headerPayload = {
        x402Version: 2,
        protocol: 'SovRoute Quad-Rail (L402 + Base + Solana + Multi-EVM)',
        resource: fullResourceUrl,
        price: options.priceUsdDisplay,
        accepts,
      };

      res.setHeader(
        'WWW-Authenticate',
        `L402 macaroon="${challenge.macaroon}", invoice="${challenge.invoice}"`
      );
      res.setHeader(
        'Payment-Required',
        Buffer.from(JSON.stringify(headerPayload)).toString('base64')
      );
      res.setHeader(
        'X-Payment-Requirements',
        'L402-Lightning, x402-Base, x402-Solana, x402-MultiEVM'
      );

      return res.status(402).json({
        statusCode: 402,
        protocol: 'Quad-Rail (1: Lightning L402 | 2: Base USDC | 3: Solana SOL/USDC | 4: Ethereum/Arbitrum/Optimism/Polygon)',
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
        instructions: {
          rail1_lightning: 'Send header: Authorization: L402 <macaroon>:<preimage>',
          rail2_base_usdc: 'Send header: Payment-Signature: <base64_eip3009_payload> (network: eip155:8453)',
          rail3_solana: 'Send header: X-Solana-Payment: <base64_json_payload> (network: solana:mainnet, asset: USDC or SOL)',
          rail4_multi_evm:
            'Send header: X-EVM-Payment: <base64_json_payload> (network: eip155:42161 | eip155:10 | eip155:137 | eip155:1, asset: USDC or ETH/POL)',
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
