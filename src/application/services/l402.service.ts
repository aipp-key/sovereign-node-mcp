import { createHash, randomBytes } from 'crypto';
import {
  L402Challenge,
  L402VerificationResult,
  L402AuthorizationHeaderSchema,
} from '../../domain/schemas/l402.schema.js';
import { ILightningGateway } from '../interfaces/lightning.interface.js';

export class L402Service {
  constructor(private readonly lightningGateway: ILightningGateway) {}

  /**
   * Generates a 402 challenge containing a BOLT-11 Lightning invoice and macaroon.
   */
  async generateChallenge(priceSats: number, resourcePath: string): Promise<L402Challenge> {
    return this.lightningGateway.createL402Invoice(
      priceSats,
      `Sovereign L402 Access: ${resourcePath}`
    );
  }

  /**
   * Verifies L402 authorization header credentials (macaroon:preimage).
   * Pure zero-trust cryptographic verification:
   * 1. Extract macaroon and preimage
   * 2. Decode macaroon caveat to find expected paymentHash
   * 3. Compute SHA-256(preimage) and verify against expected paymentHash
   * 4. Verify settlement state through the node gateway
   */
  async verifyAuthorizationHeader(
    authHeader: string | undefined,
    expectedPriceSats?: number
  ): Promise<L402VerificationResult> {
    if (!authHeader || !authHeader.startsWith('L402 ')) {
      return {
        isValid: false,
        errorReason: 'Missing or malformed L402 Authorization header. Expected format: L402 <macaroon>:<preimage>',
      };
    }

    const tokenPart = authHeader.substring(5).trim();
    const parts = tokenPart.split(':');
    if (parts.length !== 2) {
      return {
        isValid: false,
        errorReason: 'Invalid L402 token structure. Must be base64_macaroon:hex_preimage',
      };
    }

    const [rawMacaroon, rawPreimage] = parts;

    // Runtime zero-trust schema validation with Zod
    const parseResult = L402AuthorizationHeaderSchema.safeParse({
      macaroon: rawMacaroon,
      preimage: rawPreimage,
    });

    if (!parseResult.success) {
      return {
        isValid: false,
        errorReason: `Schema validation failed: ${parseResult.error.message}`,
      };
    }

    const { macaroon, preimage } = parseResult.data;

    // Decode caveat from base64 macaroon
    let expectedPaymentHash: string | undefined;
    try {
      const decodedPayload = Buffer.from(macaroon, 'base64').toString('utf8');
      const parsedMacaroon = JSON.parse(decodedPayload);
      if (!parsedMacaroon || typeof parsedMacaroon !== 'object' || Array.isArray(parsedMacaroon)) {
        return {
          isValid: false,
          errorReason: 'Malformed macaroon payload.',
        };
      }
      const caveatHash =
        typeof parsedMacaroon.caveat === 'string'
          ? parsedMacaroon.caveat.match(/payment_hash=([0-9a-fA-F]{64})/)?.[1]
          : undefined;

      if (
        caveatHash &&
        parsedMacaroon.paymentHash !== undefined &&
        String(parsedMacaroon.paymentHash).toLowerCase() !== caveatHash.toLowerCase()
      ) {
        return {
          isValid: false,
          errorReason: 'Macaroon paymentHash does not match signed caveat payment_hash.',
        };
      }

      expectedPaymentHash =
        caveatHash ||
        (typeof parsedMacaroon.paymentHash === 'string' ? parsedMacaroon.paymentHash : undefined);
    } catch {
      return {
        isValid: false,
        errorReason: 'Malformed macaroon payload. Unable to decode cryptographic caveat.',
      };
    }

    if (!expectedPaymentHash) {
      return {
        isValid: false,
        errorReason: 'Macaroon does not contain a valid payment_hash caveat.',
      };
    }

    // Verify macaroon HMAC signature, expiry, and price_sats if supported by gateway
    if (this.lightningGateway.verifyMacaroon) {
      const macCheck = this.lightningGateway.verifyMacaroon(macaroon, expectedPriceSats);
      if (!macCheck.valid) {
        return {
          isValid: false,
          errorReason: macCheck.reason || 'Macaroon cryptographic verification failed.',
        };
      }
    }

    // Verify through the lightning gateway with the expected payment hash
    return this.lightningGateway.verifyPreimage(expectedPaymentHash, preimage);
  }

  /**
   * Generates a random 32-byte secret preimage and its corresponding payment hash.
   */
  static generatePreimagePair(): { preimageHex: string; paymentHashHex: string } {
    const preimageBytes = randomBytes(32);
    const preimageHex = preimageBytes.toString('hex');
    const paymentHashHex = createHash('sha256').update(preimageBytes).digest('hex');
    return { preimageHex, paymentHashHex };
  }
}
