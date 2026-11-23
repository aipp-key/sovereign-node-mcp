import { z } from 'zod';

export const ENTERPRISE_SCENARIOS = ['gateway_catalog', 'agent_security', 'high_volume_fleet'] as const;
export type EnterpriseScenarioId = (typeof ENTERPRISE_SCENARIOS)[number];

export const EnterpriseInquiryRequestSchema = z.object({
  scenario: z.enum(ENTERPRISE_SCENARIOS),
  fullName: z.string().trim().min(2).max(120),
  workEmail: z.string().trim().email().max(160),
  organization: z.string().trim().min(2).max(160),
  contactChannel: z.string().trim().max(120).optional().default(''), // Telegram, X, Discord
  
  // Scenario-specific context tags
  interests: z.array(z.string().trim().max(100)).max(10).default([]),
  
  // Custom scenario details
  expectedVolume: z.string().trim().max(100).optional().default(''),
  settlementPreference: z.string().trim().max(100).optional().default('Base USDC'),
  notes: z.string().trim().max(2000).optional().default(''),
});

export type EnterpriseInquiryRequest = z.infer<typeof EnterpriseInquiryRequestSchema>;

export interface EnterpriseInquiryRecord extends EnterpriseInquiryRequest {
  inquiryId: string;
  createdAt: string;
  clientIpHash: string;
}
