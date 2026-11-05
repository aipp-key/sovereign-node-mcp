import { z } from 'zod';

/**
 * L402 Protocol Zero-Trust Runtime Validation Schemas
 * Standard: RFC HTTP 402 + Lightning Network Macaroon/Preimage
 */

export const PaymentHashHexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex string (32 bytes)');

export const PreimageHexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex string (32 bytes)');

export const MacaroonBase64Schema = z
  .string()
  .min(1, 'Macaroon base64 string cannot be empty');

export const CaveatConstraintSchema = z.object({
  type: z.enum(['time', 'budget', 'path', 'action']),
  key: z.string(),
  operator: z.enum(['<', '<=', '=', '!=', 'in']),
  value: z.union([z.string(), z.number()]),
});

export const L402ChallengeSchema = z.object({
  macaroon: MacaroonBase64Schema,
  invoice: z.string().startsWith('lnbc', 'Invoice must be BOLT-11 format starting with lnbc (or lntb/lnbcrt)'),
  paymentHash: PaymentHashHexSchema,
  priceSats: z.number().int().nonnegative('Price in sats must be a non-negative integer'),
  expiresAt: z.number().int().positive('Expiration timestamp must be positive'),
});

export const L402AuthorizationHeaderSchema = z.object({
  macaroon: MacaroonBase64Schema,
  preimage: PreimageHexSchema,
});

export const L402VerificationResultSchema = z.object({
  isValid: z.boolean(),
  paymentHash: PaymentHashHexSchema.optional(),
  preimage: PreimageHexSchema.optional(),
  errorReason: z.string().optional(),
});

export type L402Challenge = z.infer<typeof L402ChallengeSchema>;
export type L402AuthorizationHeader = z.infer<typeof L402AuthorizationHeaderSchema>;
export type CaveatConstraint = z.infer<typeof CaveatConstraintSchema>;
export type L402VerificationResult = z.infer<typeof L402VerificationResultSchema>;
