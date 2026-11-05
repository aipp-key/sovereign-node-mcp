import { L402Challenge, L402VerificationResult } from '../../domain/schemas/l402.schema.js';

export interface ILightningGateway {
  createL402Invoice(priceSats: number, memo: string): Promise<L402Challenge>;
  verifyPreimage(paymentHash: string, preimage: string): Promise<L402VerificationResult>;
  isInvoiceSettled(paymentHash: string): Promise<boolean>;
}
