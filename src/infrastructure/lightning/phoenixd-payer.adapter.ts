import { ILightningPayer, PaymentResult } from '../../application/interfaces/lightning-payer.interface.js';

export interface PhoenixdPayerConfig {
  baseUrl: string;
  httpPassword: string;
}

export class PhoenixdPayerAdapter implements ILightningPayer {
  constructor(private readonly config: PhoenixdPayerConfig) {}

  private getAuthHeader(): string {
    const credentials = `:${this.config.httpPassword}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  async payInvoice(invoice: string): Promise<PaymentResult> {
    const params = new URLSearchParams({ invoice });
    const response = await fetch(`${this.config.baseUrl}/payinvoice`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Autonomous payment failed on Lightning Network: ${errText}`);
    }

    const data: any = await response.json();
    return {
      paymentHash: data.paymentHash,
      preimage: data.paymentPreimage,
      feeSat: data.routingFeeSat || 0,
    };
  }
}
