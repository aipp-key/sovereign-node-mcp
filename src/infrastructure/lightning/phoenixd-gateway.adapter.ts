import { createHmac, createHash } from 'crypto';
import { ILightningGateway } from '../../application/interfaces/lightning.interface.js';
import { verifyL402Macaroon } from './macaroon.helper.js';
import {
  L402Challenge,
  L402VerificationResult,
  L402ChallengeSchema,
} from '../../domain/schemas/l402.schema.js';

export interface PhoenixdConfig {
  baseUrl: string;
  httpPassword: string;
  macaroonSecretKey: string;
}

export class PhoenixdGatewayAdapter implements ILightningGateway {
  constructor(private readonly config: PhoenixdConfig) {}

  private getAuthHeader(): string {
    const credentials = `:${this.config.httpPassword}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  async createL402Invoice(priceSats: number, memo: string): Promise<L402Challenge> {
    const params = new URLSearchParams();
    params.append('amountSat', priceSats.toString());
    params.append('description', memo.substring(0, 100));

    const response = await fetch(`${this.config.baseUrl}/createinvoice`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Phoenixd invoice creation failed: ${errText}`);
    }

    const data: any = await response.json();
    const paymentHash = data.paymentHash;
    const invoice = data.serialized;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;

    // Mint deterministic L402 macaroon with caveat
    const caveat = `payment_hash=${paymentHash}&expires_at=${expiresAt}&price_sats=${priceSats}`;
    const signature = createHmac('sha256', this.config.macaroonSecretKey)
      .update(caveat)
      .digest('hex');
    const macaroonPayload = JSON.stringify({ caveat, paymentHash, signature });
    const macaroon = Buffer.from(macaroonPayload).toString('base64');

    return L402ChallengeSchema.parse({
      macaroon,
      invoice,
      paymentHash,
      priceSats,
      expiresAt,
    });
  }

  verifyMacaroon(macaroon: string, expectedPriceSats?: number) {
    return verifyL402Macaroon(macaroon, this.config.macaroonSecretKey, expectedPriceSats);
  }

  async verifyPreimage(paymentHash: string, preimage: string): Promise<L402VerificationResult> {
    const computedHash = createHash('sha256')
      .update(Buffer.from(preimage, 'hex'))
      .digest('hex');

    if (computedHash.toLowerCase() !== paymentHash.toLowerCase()) {
      return {
        isValid: false,
        paymentHash,
        preimage,
        errorReason: 'Preimage cryptographic hash mismatch. SHA-256(preimage) != paymentHash',
      };
    }

    // Verify on-chain/Lightning settlement with Phoenixd
    const isSettled = await this.isInvoiceSettled(paymentHash);
    if (!isSettled) {
      return {
        isValid: false,
        paymentHash,
        preimage,
        errorReason: 'Lightning invoice is not yet paid on Bitcoin Mainnet.',
      };
    }

    return {
      isValid: true,
      paymentHash,
      preimage,
    };
  }

  async isInvoiceSettled(paymentHash: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/payments/incoming/${paymentHash}`, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      if (!response.ok) return false;
      const data: any = await response.json();
      return data.isPaid === true;
    } catch {
      return false;
    }
  }
}
