import crypto from 'node:crypto';
import {
  BtcWatchRecord,
  CreateBtcWatchRequest,
  WatchEvent,
  WatchStatus,
} from '../../domain/schemas/watchtower.schema.js';
import {
  dispatchWatchtowerWebhook,
  validatePublicWebhookUrl,
  WebhookFetchFn,
} from '../../infrastructure/watchtower/webhook-dispatcher.helper.js';
import { NodeTruthService } from './node-truth.service.js';

const MAX_ACTIVE_WATCHES = 500;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

interface InternalWatchEntry {
  record: BtcWatchRecord;
  readTokenHash: string;
  webhookSecret: string | null;
  expiresAtMs: number;
}

export interface CreateBtcWatchResult {
  watch: BtcWatchRecord;
  readToken: string;
  webhookSecret: string | null;
}

export interface BtcWatchtowerOptions {
  pollIntervalMs?: number;
  fetchFn?: WebhookFetchFn;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function constantTimeEqualsHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export class BtcWatchtowerService {
  private readonly watches = new Map<string, InternalWatchEntry>();
  private readonly nodeTruth: NodeTruthService;
  private readonly pollIntervalMs: number;
  private readonly fetchFn?: WebhookFetchFn;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(nodeTruthService: NodeTruthService, options: BtcWatchtowerOptions = {}) {
    this.nodeTruth = nodeTruthService;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchFn = options.fetchFn;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pollAllActive();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async createWatch(req: CreateBtcWatchRequest): Promise<CreateBtcWatchResult> {
    let normalizedWebhook: string | null = null;
    if (req.webhookUrl) {
      const check = validatePublicWebhookUrl(req.webhookUrl);
      if (!check.ok) {
        throw new Error(check.reason);
      }
      normalizedWebhook = check.normalized;
    }

    this.evictIfFull();

    const txid = req.txid.toLowerCase();
    const watchId = `wt_${crypto.randomBytes(10).toString('hex')}`;
    const readToken = `wtr_${crypto.randomBytes(18).toString('hex')}`;
    const webhookSecret = normalizedWebhook ? `whsec_${crypto.randomBytes(20).toString('hex')}` : null;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAtMs = nowMs + req.ttlHours * 3600 * 1000;
    const probe = await this.nodeTruth.checkRbfShield(txid);

    const confirmations = probe.confirmations ?? 0;
    let status: WatchStatus = 'WATCHING';
    const events: WatchEvent[] = [
      {
        type: 'WATCH_CREATED',
        severity: 'INFO',
        message: `Watch created for ${txid.slice(0, 12)}... (target=${req.confirmationsTarget} conf, ttl=${req.ttlHours}h).`,
        confirmations,
        feeRateSatPerVb: probe.feeRateSatPerVb ?? null,
        occurredAt: nowIso,
      },
    ];

    if (probe.hasConflicts) {
      status = 'CONFLICT_DETECTED';
      events.push({
        type: 'CONFLICT_DETECTED',
        severity: 'CRITICAL',
        message: probe.recommendation || 'Double-spend conflict detected on initial probe.',
        confirmations,
        feeRateSatPerVb: probe.feeRateSatPerVb ?? null,
        occurredAt: nowIso,
      });
    } else if (confirmations >= req.confirmationsTarget) {
      status = 'CONFIRMED';
      events.push({
        type: 'CONFIRMED',
        severity: 'INFO',
        message: `Transaction already reached ${confirmations} confirmations.`,
        confirmations,
        feeRateSatPerVb: probe.feeRateSatPerVb ?? null,
        occurredAt: nowIso,
      });
    } else if (probe.bip125Replaceable) {
      events.push({
        type: 'RBF_RISK_DETECTED',
        severity: 'WARN',
        message: 'Unconfirmed transaction signals BIP-125 RBF replaceability; monitoring for replacement.',
        confirmations,
        feeRateSatPerVb: probe.feeRateSatPerVb ?? null,
        occurredAt: nowIso,
      });
    }

    const record: BtcWatchRecord = {
      watchId,
      txid,
      status,
      confirmationsTarget: req.confirmationsTarget,
      confirmations,
      bip125Replaceable: probe.bip125Replaceable,
      hasConflicts: probe.hasConflicts,
      seenInMempool: probe.isInMempool,
      webhookUrl: normalizedWebhook,
      createdAt: nowIso,
      expiresAt: new Date(expiresAtMs).toISOString(),
      lastCheckedAt: nowIso,
      events,
      webhookDeliveries: [],
    };

    const entry: InternalWatchEntry = {
      record,
      readTokenHash: sha256Hex(readToken),
      webhookSecret,
      expiresAtMs,
    };
    this.watches.set(watchId, entry);

    // Notify immediately if initial state is already terminal or critical
    if (status !== 'WATCHING' && events.length > 1) {
      await this.notifyWebhook(entry, events[events.length - 1]);
    }

    return { watch: record, readToken, webhookSecret };
  }

  getWatch(watchId: string, readToken: string): BtcWatchRecord | null {
    const entry = this.watches.get(watchId);
    if (!entry) return null;
    if (!readToken || !constantTimeEqualsHex(entry.readTokenHash, sha256Hex(readToken))) {
      return null;
    }
    return entry.record;
  }

  getActiveWatchCount(): number {
    let count = 0;
    for (const entry of this.watches.values()) {
      if (entry.record.status === 'WATCHING') count++;
    }
    return count;
  }

  async pollAllActive(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const nowMs = Date.now();
      for (const entry of this.watches.values()) {
        if (entry.record.status !== 'WATCHING') continue;
        if (nowMs >= entry.expiresAtMs) {
          await this.transitionWatch(entry, 'EXPIRED', {
            type: 'EXPIRED',
            severity: 'INFO',
            message: 'Watch TTL expired before confirmation target was reached.',
            confirmations: entry.record.confirmations,
            feeRateSatPerVb: null,
            occurredAt: new Date(nowMs).toISOString(),
          });
          continue;
        }
        await this.pollSingle(entry);
      }
    } finally {
      this.polling = false;
    }
  }

  private async pollSingle(entry: InternalWatchEntry): Promise<void> {
    try {
      const probe = await this.nodeTruth.checkRbfShield(entry.record.txid);
      const nowIso = new Date().toISOString();
      const confirmations = probe.confirmations ?? 0;
      entry.record.lastCheckedAt = nowIso;
      entry.record.confirmations = confirmations;
      entry.record.bip125Replaceable = probe.bip125Replaceable;
      entry.record.hasConflicts = probe.hasConflicts;
      if (probe.isInMempool) entry.record.seenInMempool = true;

      if (probe.hasConflicts) {
        await this.transitionWatch(entry, 'CONFLICT_DETECTED', {
          type: 'CONFLICT_DETECTED',
          severity: 'CRITICAL',
          message: probe.recommendation || 'Mempool double-spend conflict detected!',
          confirmations,
          feeRateSatPerVb: probe.feeRateSatPerVb ?? null,
          occurredAt: nowIso,
        });
      } else if (confirmations >= entry.record.confirmationsTarget) {
        await this.transitionWatch(entry, 'CONFIRMED', {
          type: 'CONFIRMED',
          severity: 'INFO',
          message: `Transaction reached ${confirmations} confirmations (target=${entry.record.confirmationsTarget}).`,
          confirmations,
          feeRateSatPerVb: probe.feeRateSatPerVb ?? null,
          occurredAt: nowIso,
        });
      } else if (entry.record.seenInMempool && !probe.isInMempool && confirmations === 0) {
        await this.transitionWatch(entry, 'DROPPED_OR_REPLACED', {
          type: 'DROPPED_OR_REPLACED',
          severity: 'CRITICAL',
          message: 'Transaction disappeared from mempool without confirming (likely RBF-replaced or evicted).',
          confirmations: 0,
          feeRateSatPerVb: null,
          occurredAt: nowIso,
        });
      }
    } catch {
      // Transient RPC error; next poll cycle will retry cleanly.
    }
  }

  private async transitionWatch(
    entry: InternalWatchEntry,
    nextStatus: WatchStatus,
    event: WatchEvent
  ): Promise<void> {
    entry.record.status = nextStatus;
    entry.record.events.push(event);
    await this.notifyWebhook(entry, event);
  }

  private async notifyWebhook(entry: InternalWatchEntry, event: WatchEvent): Promise<void> {
    if (!entry.record.webhookUrl || !entry.webhookSecret) return;
    const delivery = await dispatchWatchtowerWebhook(
      entry.record.webhookUrl,
      entry.webhookSecret,
      entry.record.watchId,
      entry.record.txid,
      event,
      this.fetchFn
    );
    entry.record.webhookDeliveries.push(delivery);
  }

  private evictIfFull(): void {
    if (this.watches.size < MAX_ACTIVE_WATCHES) return;
    const nowMs = Date.now();
    for (const [id, entry] of this.watches.entries()) {
      if (entry.record.status !== 'WATCHING' || nowMs >= entry.expiresAtMs) {
        this.watches.delete(id);
        if (this.watches.size < MAX_ACTIVE_WATCHES) return;
      }
    }
    const oldestKey = this.watches.keys().next().value;
    if (oldestKey) this.watches.delete(oldestKey);
  }
}
