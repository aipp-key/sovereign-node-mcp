import { z } from 'zod';
import { Eip7702AuthorizationEntrySchema } from './eip7702.schema.js';

const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 20-byte EVM address (0x...)');

const hexDataSchema = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})*$/, 'Must be an even-length hex string starting with 0x');

const weiValueSchema = z
  .string()
  .regex(/^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/, 'Must be a non-negative integer or hex wei string');

const StablecoinSymbolSchema = z.enum(['USDC', 'USDT', 'USDe', 'DAI']);

export const EvmPreflightRequestSchema = z.object({
  protocol: z.literal('evm'),
  chainId: z.number().int().positive(),
  from: evmAddressSchema,
  to: evmAddressSchema,
  data: hexDataSchema.optional().default('0x'),
  value: weiValueSchema.optional().default('0x0'),
  blockTag: z.enum(['latest', 'pending']).optional().default('latest'),
  authorizationList: z.array(Eip7702AuthorizationEntrySchema).min(1).max(50).optional(),
  stablecoinSymbol: StablecoinSymbolSchema.optional(),
});

export const BtcPreflightRequestSchema = z
  .object({
    protocol: z.literal('btc'),
    rawTxHex: z
      .string()
      .min(100)
      .max(200000)
      .regex(/^[0-9a-fA-F]+$/)
      .refine((v) => v.length % 2 === 0, 'rawTxHex must have even length')
      .optional(),
    txid: z.string().regex(/^[0-9a-fA-F]{64}$/, 'txid must be a 64-character hex string').optional(),
    stablecoinSymbol: StablecoinSymbolSchema.optional(),
  })
  .refine((d) => Boolean(d.rawTxHex || d.txid), {
    message: 'Provide at least rawTxHex or txid for BTC pre-flight inspection.',
  });

export const PreflightGuardRequestSchema = z.union([
  EvmPreflightRequestSchema,
  BtcPreflightRequestSchema,
]);

export const GuardFindingSchema = z.object({
  source: z.string(),
  code: z.string(),
  severity: z.enum(['INFO', 'WARN', 'CRITICAL']),
  message: z.string(),
});

export const PreflightGuardVerdictSchema = z.enum(['ALLOW', 'WARN', 'BLOCK']);

export type EvmPreflightRequest = z.infer<typeof EvmPreflightRequestSchema>;
export type BtcPreflightRequest = z.infer<typeof BtcPreflightRequestSchema>;
export type PreflightGuardRequest = z.infer<typeof PreflightGuardRequestSchema>;
export type GuardFinding = z.infer<typeof GuardFindingSchema>;
export type PreflightGuardVerdict = z.infer<typeof PreflightGuardVerdictSchema>;

export interface PreflightGuardReport {
  verdict: PreflightGuardVerdict;
  riskScore: number;
  protocol: 'evm' | 'btc';
  checksExecuted: string[];
  findings: GuardFinding[];
  details: Record<string, unknown>;
  summary: string;
  inspectedAt: string;
}
