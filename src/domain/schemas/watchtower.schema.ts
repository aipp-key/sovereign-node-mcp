import { z } from 'zod';

export const CreateBtcWatchRequestSchema = z.object({
  txid: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'txid must be a 64-character hex Bitcoin transaction ID'),
  webhookUrl: z
    .string()
    .url('webhookUrl must be a valid URL')
    .max(512)
    .optional(),
  ttlHours: z.number().int().min(1).max(72).optional().default(24),
  confirmationsTarget: z.number().int().min(1).max(6).optional().default(1),
});

export type CreateBtcWatchRequest = z.infer<typeof CreateBtcWatchRequestSchema>;

export type WatchStatus =
  | 'WATCHING'
  | 'CONFIRMED'
  | 'CONFLICT_DETECTED'
  | 'DROPPED_OR_REPLACED'
  | 'EXPIRED';

export type WatchEventType =
  | 'WATCH_CREATED'
  | 'RBF_RISK_DETECTED'
  | 'CONFLICT_DETECTED'
  | 'DROPPED_OR_REPLACED'
  | 'CONFIRMED'
  | 'EXPIRED';

export interface WatchEvent {
  type: WatchEventType;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
  confirmations: number;
  feeRateSatPerVb: number | null;
  occurredAt: string;
}

export interface WebhookDeliveryLog {
  eventType: WatchEventType;
  delivered: boolean;
  httpStatus: number | null;
  attempts: number;
  error: string | null;
  attemptedAt: string;
}

export interface BtcWatchRecord {
  watchId: string;
  txid: string;
  status: WatchStatus;
  confirmationsTarget: number;
  confirmations: number;
  bip125Replaceable: boolean;
  hasConflicts: boolean;
  seenInMempool: boolean;
  webhookUrl: string | null;
  createdAt: string;
  expiresAt: string;
  lastCheckedAt: string;
  events: WatchEvent[];
  webhookDeliveries: WebhookDeliveryLog[];
}
