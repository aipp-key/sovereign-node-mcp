import { z } from 'zod';

const uintInputSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^(0x[0-9a-fA-F]{1,16}|[0-9]{1,16})$/, 'Must be a valid non-negative integer or hex string'),
]);

export const Eip7702AuthorizationEntrySchema = z.object({
  chainId: uintInputSchema,
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 20-byte EVM address (0x...)'),
  nonce: uintInputSchema,
  bytecode: z
    .string()
    .regex(/^0x([0-9a-fA-F]{2})*$/, 'Optional bytecode must be an even-length hex string starting with 0x')
    .optional(),
});

export const Eip7702ShieldRequestSchema = z.object({
  executionChainId: z.number().int().positive().optional(),
  authorizationList: z.array(Eip7702AuthorizationEntrySchema).min(1).max(50),
});

export const Eip7702VerdictSchema = z.enum([
  'SAFE_VERIFIED',
  'SUSPICIOUS_UNVERIFIED',
  'CRITICAL_DRAIN_RISK',
]);

export const Eip7702FindingSchema = z.object({
  code: z.string(),
  severity: z.enum(['INFO', 'WARN', 'CRITICAL']),
  message: z.string(),
});

export const Eip7702EntryReportSchema = z.object({
  index: z.number().int().nonnegative(),
  chainId: z.number().int().nonnegative(),
  address: z.string(),
  nonce: z.number().int().nonnegative(),
  isRevocation: z.boolean(),
  reputation: z.enum(['REVOCATION_ZERO', 'VERIFIED_STANDARD', 'UNVERIFIED', 'KNOWN_DRAINER']),
  standardLabel: z.string().nullable(),
  bytecodeSizeBytes: z.number().int().nonnegative(),
  crossChainReplayRisk: z.boolean(),
  detectedOpcodes: z.object({
    selfdestruct: z.boolean(),
    delegatecall: z.boolean(),
    create: z.boolean(),
    create2: z.boolean(),
  }),
  detectedDrainSelectors: z.array(z.string()),
  findings: z.array(Eip7702FindingSchema),
  verdict: Eip7702VerdictSchema,
});

export const Eip7702ShieldReportSchema = z.object({
  verdict: Eip7702VerdictSchema,
  riskScore: z.number().int().min(0).max(100),
  executionChainId: z.number().int().positive().nullable(),
  totalAuthorizations: z.number().int().positive(),
  summary: z.string(),
  entries: z.array(Eip7702EntryReportSchema),
  inspectedAt: z.string(),
});

export type Eip7702AuthorizationEntry = z.infer<typeof Eip7702AuthorizationEntrySchema>;
export type Eip7702ShieldRequest = z.infer<typeof Eip7702ShieldRequestSchema>;
export type Eip7702Verdict = z.infer<typeof Eip7702VerdictSchema>;
export type Eip7702Finding = z.infer<typeof Eip7702FindingSchema>;
export type Eip7702EntryReport = z.infer<typeof Eip7702EntryReportSchema>;
export type Eip7702ShieldReport = z.infer<typeof Eip7702ShieldReportSchema>;
