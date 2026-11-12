import { exec } from 'child_process';
import { promisify } from 'util';
import { createHmac, createHash } from 'crypto';
import { ILightningGateway } from '../../application/interfaces/lightning.interface.js';
import { verifyL402Macaroon } from './macaroon.helper.js';
import {
  L402Challenge,
  L402VerificationResult,
  L402ChallengeSchema,
} from '../../domain/schemas/l402.schema.js';

const execAsync = promisify(exec);

export interface LndConfig {
  tailscaleHost: string;
  containerName: string;
  macaroonSecretKey: string;
  devBypassSettlement?: boolean;
}

export class LndGatewayAdapter implements ILightningGateway {
  constructor(private readonly config: LndConfig) {}

  private async executeLndCommand(cmd: string): Promise<string> {
    const isLocal = this.config.tailscaleHost === '127.0.0.1' || this.config.tailscaleHost === 'localhost';
    const baseCmd = `docker exec ${this.config.containerName} lncli --tlscertpath=/var/lib/lnd/data/tls.cert --macaroonpath=/var/lib/lnd/data/data/chain/bitcoin/mainnet/invoice.macaroon ${cmd}`;
    const fullCommand = isLocal
      ? baseCmd
      : `ssh -o ConnectTimeout=5 -o BatchMode=yes root@${this.config.tailscaleHost} "${baseCmd}"`;
    const { stdout, stderr } = await execAsync(fullCommand);
    if (stderr && !stdout) {
      throw new Error(`LND Gateway Error: ${stderr}`);
    }
    return stdout.trim();
  }

  /**
   * Generates a BOLT-11 invoice and an L402 macaroon with caveats.
   */
  async createL402Invoice(priceSats: number, memo: string): Promise<L402Challenge> {
    const rawOutput = await this.executeLndCommand(
      `addinvoice --amt=${priceSats} --memo='${memo.replace(/'/g, "")}'`
    );
    const parsed = JSON.parse(rawOutput);

    const paymentHash = parsed.r_hash;
    const invoice = parsed.payment_request;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity

    // Mint a deterministic L402 macaroon signed with server secret
    const caveat = `payment_hash=${paymentHash}&expires_at=${expiresAt}&price_sats=${priceSats}`;
    const signature = createHmac('sha256', this.config.macaroonSecretKey)
      .update(caveat)
      .digest('hex');
    const macaroonPayload = JSON.stringify({ caveat, signature });
    const macaroon = Buffer.from(macaroonPayload).toString('base64');

    const challengePayload = {
      macaroon,
      invoice,
      paymentHash,
      priceSats,
      expiresAt,
    };

    return L402ChallengeSchema.parse(challengePayload);
  }

  verifyMacaroon(macaroon: string, expectedPriceSats?: number) {
    return verifyL402Macaroon(macaroon, this.config.macaroonSecretKey, expectedPriceSats);
  }

  /**
   * Verifies if SHA-256(preimage) matches paymentHash and checks LND invoice settlement state.
   */
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

    // If in dev simulation mode, validate cryptographic proof without requiring mainnet sat spend
    if (this.config.devBypassSettlement) {
      return {
        isValid: true,
        paymentHash,
        preimage,
      };
    }

    // Verify on-node settlement status via LND in production
    try {
      const isSettled = await this.isInvoiceSettled(paymentHash);
      if (!isSettled) {
        return {
          isValid: false,
          paymentHash,
          preimage,
          errorReason: 'Lightning invoice is not marked as SETTLED on the sovereign node.',
        };
      }

      return {
        isValid: true,
        paymentHash,
        preimage,
      };
    } catch (err: any) {
      return {
        isValid: false,
        paymentHash,
        preimage,
        errorReason: `Node lookup error: ${err.message}`,
      };
    }
  }

  /**
   * Checks whether the invoice is settled on LND.
   */
  async isInvoiceSettled(paymentHash: string): Promise<boolean> {
    const rawOutput = await this.executeLndCommand(`lookupinvoice --rhash=${paymentHash}`);
    const parsed = JSON.parse(rawOutput);
    return parsed.settled === true || parsed.state === 'SETTLED';
  }
}
