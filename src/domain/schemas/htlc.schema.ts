import { z } from 'zod';
import { Hex64Schema } from './node-truth.schema.js';

/**
 * Cross-Rail Atomic Swap State Machine Schemas
 * Formalized State Transitions (OPEN -> LOCKED -> REDEEMED / REFUNDED)
 */

export const HTLCStatusSchema = z.enum([
  'INITIATED',
  'LOCKED',
  'PREIMAGE_REVEALED',
  'REDEEMED',
  'REFUNDED',
]);

export const CrossRailSwapOrderSchema = z.object({
  swapId: z.string().uuid(),
  direction: z.enum(['BASE_USDC_TO_LIGHTNING_SATS', 'LIGHTNING_SATS_TO_BASE_USDC']),
  paymentHash: Hex64Schema,
  preimage: Hex64Schema.optional(),
  amountSats: z.number().int().positive('Satoshi amount must be a positive integer'),
  amountUsdcUnits: z.bigint().positive('USDC units (6 decimals) must be positive'),
  baseTimelockBlocks: z.number().int().positive(),
  lightningCltvDelta: z.number().int().positive(),
  initiatorAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Valid EVM address'),
  status: HTLCStatusSchema,
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export type HTLCStatus = z.infer<typeof HTLCStatusSchema>;
export type CrossRailSwapOrder = z.infer<typeof CrossRailSwapOrderSchema>;
