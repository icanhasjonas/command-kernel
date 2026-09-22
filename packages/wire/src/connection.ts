/**
 * A socket that stays up: connects, notices when it is dead, and reconnects with
 * jittered exponential backoff. It knows nothing about commands; the client
 * layers calls and events on top. DOM-free: the host supplies the socket factory
 * (the browser's WebSocket by default, a header-carrying one on a native app).
 */

/** The part of a WebSocket this needs; the browser's, Bun's and undici's all fit. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface ConnectionOptions {
  url: string;
  socket?: (url: string) => WebSocketLike;
  /** backoff bounds for reconnecting, ms (default 500 .. 15,000) */
  backoff?: { minMs?: number; maxMs?: number };
  /**
   * Liveness: send `ping` every `intervalMs`; if nothing at all arrives for two
   * intervals the socket is treated as dead and replaced. A server answers `ping`
   * with `pong` (a Durable Object does it without waking, via its auto-response).
   * `false` turns it off. Default { intervalMs: 25000, ping: "ping", pong: "pong" }.
   */
  heartbeat?: { intervalMs: number; ping: string; pong: string } | false;
  /** WebSocket subprotocols for the default socket factory */
  protocols?: string[];
  /** 0..1, for tests */
  random?: () => number;
}

const OPEN = 1;

type SocketCtor = new (url: string, protocols?: string[]) => WebSocketLike;

/** The runtime's own WebSocket (browsers, Workers, Bun, Node 22+). This package ships no DOM lib types. */
function defaultSocket(protocols: string[] | undefined): (url: string) => WebSocketLike {
  return (url) => {
    const Ctor = (globalThis as { WebSocket?: SocketCtor }).WebSocket; // structural peek, no DOM types
    if (!Ctor) throw new Error("No global WebSocket here: pass `socket` to createWireClient");
    return new Ctor(url, protocols);
  };
}

export interface Connection {
  readonly status: ConnectionStatus;
  /** true when a frame sent now will go out */
  readonly isOpen: boolean;
  start(): void;
  /** skip the backoff wait and try now (e.g. the host saw the network come back) */
  retryNow(): void;
  stop(): void;
  send(data: string): boolean;
}

export function createConnection(
  opts: ConnectionOptions,
  onMessage: (text: string) => void,
  onStatus: (s: ConnectionStatus) => void,
): Connection {
  const make = opts.socket ?? defaultSocket(opts.protocols);
  const minMs = opts.backoff?.minMs ?? 500;
  const maxMs = opts.backoff?.maxMs ?? 15_000;
  const beat =
    opts.heartbeat === undefined
      ? { intervalMs: 25_000, ping: "ping", pong: "pong" }
      : opts.heartbeat;
  const random = opts.random ?? Math.random;

  let ws: WebSocketLike | null = null;
  let status: ConnectionStatus = "idle";
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let pulse: ReturnType<typeof setInterval> | null = null;
  let lastSeen = 0;
  let wanted = false;

  const set = (s: ConnectionStatus) => {
    if (s === status) return;
    status = s;
    onStatus(s);
  };
  const clearTimers = () => {
    if (retry) clearTimeout(retry);
    if (pulse) clearInterval(pulse);
    retry = null;
    pulse = null;
  };

  function open() {
    clearTimers();
    set(attempt === 0 ? "connecting" : "reconnecting");
    const sock = make(opts.url);
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      attempt = 0;
      lastSeen = Date.now();
      set("open");
      if (beat) {
        pulse = setInterval(() => {
          // a half-open mobile socket can sit in CLOSING for tens of seconds before
          // onclose fires: give up on it NOW and reconnect, then let close() finish
          if (Date.now() - lastSeen > beat.intervalMs * 2) {
            lost(sock);
            sock.close(4000, "heartbeat lost");
          } else if (sock.readyState === OPEN) sock.send(beat.ping);
        }, beat.intervalMs);
      }
    };
    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      lastSeen = Date.now();
      const text = typeof ev.data === "string" ? ev.data : "";
      if (!text || (beat && text === beat.pong)) return;
      onMessage(text);
    };
    sock.onerror = () => {
      // every error is followed by a close; that is where recovery happens
    };
    sock.onclose = () => lost(sock);
  }

  /** `sock` is gone (closed, or declared dead): forget it and, if still wanted, come back. */
  function lost(sock: WebSocketLike) {
    if (ws !== sock) return; // already replaced; a late close of an old socket means nothing
    ws = null;
    clearTimers();
    if (!wanted) return set("closed");
    // full jitter: a fleet of clients must not reconnect in lockstep
    const delay = Math.floor(random() * Math.min(maxMs, minMs * 2 ** attempt));
    attempt++;
    set("reconnecting");
    retry = setTimeout(open, delay);
  }

  return {
    get status() {
      return status;
    },
    get isOpen() {
      return ws?.readyState === OPEN;
    },
    start() {
      wanted = true;
      if (!ws && !retry) open();
    },
    retryNow() {
      if (wanted && !ws) open();
    },
    stop() {
      wanted = false;
      attempt = 0; // a later start() is a fresh connection, not a retry
      clearTimers();
      const sock = ws;
      ws = null;
      sock?.close(1000, "client closed");
      set("closed");
    },
    send(data) {
      if (ws?.readyState !== OPEN) return false;
      ws.send(data);
      return true;
    },
  };
}
