import { createHash } from 'node:crypto';
import { NWCClient } from '@getalby/sdk';
import { ILightningPayer, PaymentResult } from '../../application/interfaces/lightning-payer.interface.js';

export interface NwcPayerConfig {
  nostrWalletConnectUrl: string;
}

export class NwcPayerAdapter implements ILightningPayer {
  public readonly config: NwcPayerConfig;
  private client: NWCClient;

  constructor(config: NwcPayerConfig) {
    if (!config.nostrWalletConnectUrl || !config.nostrWalletConnectUrl.startsWith('nostr')) {
      throw new Error('Invalid Nostr Wallet Connect URL. Must start with nostr+walletconnect:// or nostrwalletconnect://');
    }
    this.config = config;
    this.client = new NWCClient({
      nostrWalletConnectUrl: config.nostrWalletConnectUrl,
    });
  }

  async payInvoice(invoice: string): Promise<PaymentResult> {
    try {
      const response = await this.client.payInvoice({ invoice });

      if (!response || !response.preimage) {
        throw new Error('NWC payInvoice returned empty response or missing preimage');
      }

      const preimageHex = response.preimage;
      const paymentHash = createHash('sha256')
        .update(Buffer.from(preimageHex, 'hex'))
        .digest('hex');

      const feeSat = response.fees_paid ? Math.round(response.fees_paid / 1000) : 0;

      return {
        paymentHash,
        preimage: preimageHex,
        feeSat,
      };
    } catch (error: any) {
      throw new Error(`Alby NWC payment failed: ${error?.message || error}`);
    }
  }

  async getBalance(): Promise<{ balanceSat: number }> {
    try {
      const res = await this.client.getBalance();
      const balanceSat = Math.round(res.balance / 1000);
      return { balanceSat };
    } catch (error: any) {
      throw new Error(`Failed to query Alby NWC balance: ${error?.message || error}`);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
    }
  }
}
