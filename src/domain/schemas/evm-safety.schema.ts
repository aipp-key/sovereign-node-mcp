import { z } from 'zod';

const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 20-byte EVM address (0x...)');

const hexDataSchema = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})*$/, 'Must be an even-length hex string starting with 0x');

const weiValueSchema = z
  .string()
  .regex(/^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/, 'Must be a non-negative integer or hex wei string');

export const SUPPORTED_EVM_CHAIN_IDS = [1, 10, 137, 8453, 42161, 11155111] as const;

export const EvmSimulateTxRequestSchema = z.object({
  chainId: z.number().int().positive(),
  from: evmAddressSchema,
  to: evmAddressSchema,
  data: hexDataSchema.optional().default('0x'),
  value: weiValueSchema.optional().default('0x0'),
  blockTag: z.enum(['latest', 'pending']).optional().default('latest'),
});

export const EvmAddressSafetyRequestSchema = z.object({
  chainId: z.number().int().positive(),
  address: evmAddressSchema,
});

export const EvmAddressSafetyBatchRequestSchema = z.object({
  chainId: z.number().int().positive(),
  addresses: z.array(evmAddressSchema).min(1).max(10),
});

export const SafetyFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(['INFO', 'WARN', 'CRITICAL']),
  message: z.string(),
});

export const EvmSimulateTxVerdictSchema = z.enum(['ALLOW', 'WARN', 'BLOCK']);

export const EvmSimulateTxReportSchema = z.object({
  verdict: EvmSimulateTxVerdictSchema,
  riskScore: z.number().int().min(0).max(100),
  chainId: z.number().int().positive(),
  from: z.string(),
  to: z.string(),
  valueWei: z.string(),
  simulation: z.object({
    success: z.boolean(),
    revertReason: z.string().nullable(),
    revertSelector: z.string().nullable(),
    gasEstimate: z.string().nullable(),
    returnDataPreview: z.string(),
  }),
  calldataAnalysis: z.object({
    selector: z.string().nullable(),
    action: z.string(),
    isApproval: z.boolean(),
    isUnlimitedApproval: z.boolean(),
    spender: z.string().nullable(),
    amountRaw: z.string().nullable(),
  }),
  targetInspection: z.object({
    isContract: z.boolean(),
    isEip7702Delegated: z.boolean(),
    delegatedTarget: z.string().nullable(),
    bytecodeSizeBytes: z.number().int().nonnegative(),
    mlRiskScore: z.number().nullable(),
    mlVerdict: z.string().nullable(),
  }),
  findings: z.array(SafetyFindingSchema),
  summary: z.string(),
  inspectedAt: z.string(),
});

export const EvmAddressVerdictSchema = z.enum(['SAFE', 'CAUTION', 'HIGH_RISK']);

export const EvmAddressSafetyReportSchema = z.object({
  verdict: EvmAddressVerdictSchema,
  riskScore: z.number().int().min(0).max(100),
  chainId: z.number().int().positive(),
  address: z.string(),
  accountType: z.enum([
    'EOA',
    'EIP7702_DELEGATED_EOA',
    'CONTRACT',
    'PROXY_CONTRACT',
    'ERC20_TOKEN',
  ]),
  balanceWei: z.string(),
  nonce: z.number().int().nonnegative(),
  delegatedTarget: z.string().nullable(),
  proxyInfo: z
    .object({
      isProxy: z.boolean(),
      implementationAddress: z.string().nullable(),
    })
    .nullable(),
  tokenInfo: z
    .object({
      isErc20: z.boolean(),
      symbol: z.string().nullable(),
      decimals: z.number().int().nullable(),
      totalSupplyRaw: z.string().nullable(),
      owner: z.string().nullable(),
    })
    .nullable(),
  bytecodeAnalysis: z.object({
    bytecodeSizeBytes: z.number().int().nonnegative(),
    opcodes: z.object({
      selfdestruct: z.boolean(),
      delegatecall: z.boolean(),
      create: z.boolean(),
      create2: z.boolean(),
    }),
    drainSelectors: z.array(z.string()),
    tokenRiskSelectors: z.array(z.string()),
    mlRiskScore: z.number().nullable(),
    mlVerdict: z.string().nullable(),
  }),
  findings: z.array(SafetyFindingSchema),
  summary: z.string(),
  inspectedAt: z.string(),
});

export type EvmSimulateTxRequest = z.infer<typeof EvmSimulateTxRequestSchema>;
export type EvmAddressSafetyRequest = z.infer<typeof EvmAddressSafetyRequestSchema>;
export type SafetyFinding = z.infer<typeof SafetyFindingSchema>;
export type EvmSimulateTxReport = z.infer<typeof EvmSimulateTxReportSchema>;
export type EvmAddressSafetyReport = z.infer<typeof EvmAddressSafetyReportSchema>;
