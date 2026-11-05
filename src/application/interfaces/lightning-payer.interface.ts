export interface PaymentResult {
  paymentHash: string;
  preimage: string;
  feeSat: number;
}

export interface ILightningPayer {
  payInvoice(invoice: string): Promise<PaymentResult>;
}
