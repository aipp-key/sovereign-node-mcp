import { exec } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';
import type { WhaleTapeSnapshot, WhaleTxEvent } from '../../domain/schemas/oracle-feeds.schema.js';
import { parseRawBitcoinTx, type ParsedRawBitcoinTx } from './btc-rawtx-parser.helper.js';

const execAsync = promisify(exec);

const MIN_STORE_SATS = 100_000_000n; // Store >= 1 BTC so queries can filter down to minBtc=1
const MAX_STORED_EVENTS = 200;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ZMQ_FRAME_BYTES = 2_000_000;
const MIN_BACKOFF_MS = 1_500;
const MAX_BACKOFF_MS = 30_000;

interface StoredWhaleTx {
  txid: string;
  totalOutputSats: bigint;
  totalOutputBtc: number;
  outputCount: number;
  inputCount: number;
  vsize: number;
  segwit: boolean;
  seenAtMs: number;
}

export interface BtcZmqWhaleOptions {
  host?: string;
  port?: number;
  containerName?: string;
}

export class BtcZmqWhaleIngestor {
  private readonly events: StoredWhaleTx[] = [];
  private readonly containerName: string;
  private readonly explicitHost?: string;
  private readonly port: number;
  private socket: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private connected = false;
  private backoffMs = MIN_BACKOFF_MS;
  private totalRawTxSeen = 0;

  constructor(options: BtcZmqWhaleOptions = {}) {
    this.explicitHost = options.host || process.env.BITCOIND_ZMQ_HOST || undefined;
    this.port = options.port || Number(process.env.BITCOIND_ZMQ_PORT) || 28333;
    this.containerName = options.containerName || 'sovereign-bitcoind';
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  recordParsedTx(parsed: ParsedRawBitcoinTx, now: number = Date.now()): void {
    this.totalRawTxSeen += 1;
    if (parsed.totalOutputSats < MIN_STORE_SATS) return;

    if (!this.events.some((e) => e.txid === parsed.txid)) {
      this.events.push({
        txid: parsed.txid,
        totalOutputSats: parsed.totalOutputSats,
        totalOutputBtc: parsed.totalOutputBtc,
        outputCount: parsed.outputCount,
        inputCount: parsed.inputCount,
        vsize: parsed.vsize,
        segwit: parsed.segwit,
        seenAtMs: now,
      });
    }

    const cutoff = now - WINDOW_MS;
    while (this.events.length > 0 && this.events[0]!.seenAtMs < cutoff) {
      this.events.shift();
    }
    while (this.events.length > MAX_STORED_EVENTS) {
      this.events.shift();
    }
  }

  recordRawTx(rawTxBuf: Buffer, now: number = Date.now()): void {
    const parsed = parseRawBitcoinTx(rawTxBuf);
    if (parsed) this.recordParsedTx(parsed, now);
  }

  setConnectedForTest(val: boolean): void {
    this.connected = val;
  }

  getSnapshot(minBtc = 10, limit = 25, now: number = Date.now()): WhaleTapeSnapshot {
    const t0 = performance.now();
    const minSats = BigInt(Math.round(minBtc * 100_000_000));
    const cutoff = now - WINDOW_MS;
    const matched: WhaleTxEvent[] = [];

    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const ev = this.events[i]!;
      if (ev.seenAtMs < cutoff) break;
      if (ev.totalOutputSats >= minSats) {
        matched.push({
          txid: ev.txid,
          totalOutputSats: ev.totalOutputSats.toString(),
          totalOutputBtc: ev.totalOutputBtc,
          outputCount: ev.outputCount,
          inputCount: ev.inputCount,
          vsize: ev.vsize,
          segwit: ev.segwit,
          seenAt: new Date(ev.seenAtMs).toISOString(),
          ageMs: Math.max(0, now - ev.seenAtMs),
        });
      }
    }

    return {
      timestamp: new Date(now).toISOString(),
      computedInMs: Math.round((performance.now() - t0) * 1000) / 1000,
      zmqConnected: this.connected,
      minBtcThreshold: minBtc,
      totalRawTxSeen: this.totalRawTxSeen,
      matchedCount: matched.length,
      windowMinutes: WINDOW_MS / 60_000,
      events: matched.slice(0, limit),
    };
  }

  private async resolveHost(): Promise<string> {
    if (this.explicitHost) return this.explicitHost;
    try {
      const { stdout } = await execAsync(
        `docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" ${this.containerName}`,
        { timeout: 3000 }
      );
      const ip = stdout.trim();
      if (ip && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch {
      // Fallback to localhost.
    }
    return '127.0.0.1';
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) void this.connect();
    }, delay);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const host = await this.resolveHost();
    if (this.stopped) return;

    const socket = net.connect(this.port, host);
    this.socket = socket;
    let greetingDone = false;
    let buf: Buffer = Buffer.alloc(0);
    let currentParts: Buffer[] = [];

    socket.on('connect', () => {
      if (this.stopped || this.socket !== socket) return;
      const greeting = Buffer.alloc(64);
      greeting[0] = 0xff;
      greeting[8] = 0x01;
      greeting[9] = 0x7f;
      greeting[10] = 3;
      greeting[11] = 0;
      Buffer.from('NULL').copy(greeting, 12);
      socket.write(greeting);
    });

    socket.on('data', (chunk) => {
      if (this.stopped || this.socket !== socket) return;
      buf = Buffer.concat([buf, chunk]);

      if (!greetingDone) {
        if (buf.length < 64) return;
        greetingDone = true;
        buf = buf.subarray(64);
        const readyBody = Buffer.concat([
          Buffer.from([5]), Buffer.from('READY'),
          Buffer.from([11]), Buffer.from('Socket-Type'),
          Buffer.from([0, 0, 0, 3]), Buffer.from('SUB'),
        ]);
        const subBody = Buffer.from('\x01rawtx');
        socket.write(
          Buffer.concat([
            Buffer.from([0x04, readyBody.length]),
            readyBody,
            Buffer.from([0x00, subBody.length]),
            subBody,
          ])
        );
        this.connected = true;
        this.backoffMs = MIN_BACKOFF_MS;
      }

      while (buf.length >= 2) {
        const flags = buf[0]!;
        const isLong = (flags & 0x02) !== 0;
        const isCmd = (flags & 0x04) !== 0;
        const hasMore = (flags & 0x01) !== 0;
        const hdrLen = isLong ? 9 : 2;
        if (buf.length < hdrLen) break;

        let size = 0;
        if (isLong) {
          const bigSize = buf.readBigUInt64BE(1);
          if (bigSize > BigInt(MAX_ZMQ_FRAME_BYTES)) {
            socket.destroy();
            return;
          }
          size = Number(bigSize);
        } else {
          size = buf[1]!;
        }
        if (buf.length < hdrLen + size) break;

        const payload = buf.subarray(hdrLen, hdrLen + size);
        buf = buf.subarray(hdrLen + size);

        if (isCmd) continue;
        currentParts.push(payload);
        if (!hasMore) {
          if (currentParts.length >= 2 && currentParts[0]!.toString('ascii') === 'rawtx') {
            this.recordRawTx(currentParts[1]!);
          }
          currentParts = [];
        }
      }
    });

    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.connected = false;
      }
      this.scheduleReconnect();
    });

    socket.on('error', () => {
      // Close event manages cleanup and reconnection.
    });
  }
}
