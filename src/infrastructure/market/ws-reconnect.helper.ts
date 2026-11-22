export interface ManagedSocketOptions {
  url: string;
  pingIntervalMs?: number;
  pingPayload?: string | (() => string);
  maxFrameChars?: number;
  staleTimeoutMs?: number;
  onOpen?: (ws: WebSocket) => void;
  onMessage: (raw: string) => void;
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_FRAME_CHARS = 65_536;
const DEFAULT_STALE_TIMEOUT_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 10_000;

export class ManagedWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastMessageMs = 0;
  private stopped = false;
  private backoffMs = MIN_BACKOFF_MS;

  constructor(private readonly options: ManagedSocketOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors on shutdown.
      }
      this.ws = null;
    }
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  send(payload: string): boolean {
    if (!this.isOpen() || !this.ws) return false;
    try {
      this.ws.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.connect();
    }, delay);
  }

  private connect(): void {
    if (this.stopped) return;
    this.clearTimers();
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.addEventListener('open', () => {
      if (this.stopped || this.ws !== socket) return;
      this.backoffMs = MIN_BACKOFF_MS;
      this.lastMessageMs = Date.now();
      this.options.onOpen?.(socket);
      const { pingIntervalMs, pingPayload } = this.options;
      if (pingIntervalMs && pingPayload) {
        this.pingTimer = setInterval(() => {
          const msg = typeof pingPayload === 'function' ? pingPayload() : pingPayload;
          this.send(msg);
        }, pingIntervalMs);
      }
      const staleTimeoutMs = this.options.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
      this.watchdogTimer = setInterval(() => {
        if (this.stopped || this.ws !== socket) return;
        if (Date.now() - this.lastMessageMs > staleTimeoutMs) {
          try {
            socket.close();
          } catch {
            // Ignore close errors from zombie sockets.
          }
        }
      }, WATCHDOG_INTERVAL_MS);
    });

    socket.addEventListener('message', (event) => {
      if (this.stopped) return;
      if (typeof event.data !== 'string') return;
      const maxChars = this.options.maxFrameChars ?? DEFAULT_MAX_FRAME_CHARS;
      if (event.data.length > maxChars) return;
      this.lastMessageMs = Date.now();
      this.options.onMessage(event.data);
    });

    socket.addEventListener('close', () => {
      if (this.ws === socket) this.ws = null;
      this.clearTimers();
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // Close event handles cleanup and reconnection.
    });
  }
}
