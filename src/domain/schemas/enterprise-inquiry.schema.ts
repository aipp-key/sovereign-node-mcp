import { z } from 'zod';

export const ENTERPRISE_PRODUCT_IDS = [
  'preflight_guard_sla',
  'prepaid_fleet_key',
  'gateway_partnership',
  'btc_watchtower_zmq',
  'evm_pectra_onnx',
  'market_intel_oracles',
] as const;

export const ENTERPRISE_SETTLEMENT_RAILS = [
  'base_usdc',
  'lightning_btc',
  'solana_usdc',
  'card_usd_invoice',
] as const;

export const EnterpriseInquiryRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  workEmail: z.string().trim().email().max(160),
  organization: z.string().trim().min(2).max(160),
  roleOrChannel: z.string().trim().max(120).optional().default(''),
  selectedProducts: z.array(z.enum(ENTERPRISE_PRODUCT_IDS)).min(1).max(6),
  preferredSettlement: z.enum(ENTERPRISE_SETTLEMENT_RAILS).default('base_usdc'),
  monthlyVolume: z.string().trim().max(80).default('50k-500k'),
  notes: z.string().trim().max(2000).optional().default(''),
});

export type EnterpriseInquiryRequest = z.infer<typeof EnterpriseInquiryRequestSchema>;

export interface EnterpriseInquiryRecord extends EnterpriseInquiryRequest {
  inquiryId: string;
  createdAt: string;
  clientIpHash: string;
}
