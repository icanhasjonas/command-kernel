/**
 * A socket that stays up: connects, notices when it is dead, and reconnects with
 * jittered exponential backoff. It knows nothing about commands; the client layers
 * calls and events on top. DOM-free: the host supplies the socket factory (the
 * browser's WebSocket by default, a header-carrying one on a native app).
 *
 * Liveness is a PING with its own DEADLINE, not a clock comparison: a background tab
 * whose timers the browser throttles to once a minute would fail any "did anything
 * arrive in the last N seconds" test even on a perfectly healthy socket. Here the
 * deadline is armed when a ping goes out and cancelled by any message that arrives,
 * so throttling delays the next ping instead of killing the connection.
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

export interface Heartbeat {
  /** how often to ping while the socket is quiet (default 25,000 ms) */
  intervalMs: number;
  ping: string;
  pong: string;
  /** how long a ping may go unanswered before the socket is replaced (default 10,000 ms) */
  pongWaitMs?: number;
}

export interface ConnectionOptions {
  url: string;
  socket?: (url: string) => WebSocketLike;
  /** backoff bounds for reconnecting, ms (default 500 .. 15,000) */
  backoff?: { minMs?: number; maxMs?: number };
  /** liveness checks; `false` turns them off */
  heartbeat?: Heartbeat | false;
  /** WebSocket subprotocols for the default socket factory */
  protocols?: string[];
  /** 0..1, for tests */
  random?: () => number;
}

const OPEN = 1;
const DEFAULT_BEAT: Heartbeat = { intervalMs: 25_000, ping: "ping", pong: "pong" };

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
  /** check this socket is still alive (a call just timed out): ping, and replace it if silent */
  probe(): void;
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
  const beat = opts.heartbeat === undefined ? DEFAULT_BEAT : opts.heartbeat;
  const pongWait = beat ? (beat.pongWaitMs ?? Math.min(10_000, beat.intervalMs)) : 0;
  const random = opts.random ?? Math.random;

  let ws: WebSocketLike | null = null;
  let status: ConnectionStatus = "idle";
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let pulse: ReturnType<typeof setInterval> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let wanted = false;

  const set = (s: ConnectionStatus) => {
    if (s === status) return;
    status = s;
    onStatus(s);
  };
  const clearTimers = () => {
    if (retry) clearTimeout(retry);
    if (pulse) clearInterval(pulse);
    if (deadline) clearTimeout(deadline);
    retry = pulse = deadline = null;
  };

  /** Send a ping and require an answer before `pongWait`. */
  function ping(sock: WebSocketLike) {
    if (!beat || sock.readyState !== OPEN || deadline) return;
    sock.send(beat.ping);
    deadline = setTimeout(() => {
      deadline = null;
      lost(sock);
      sock.close(4000, "no pong");
    }, pongWait);
  }

  function open() {
    clearTimers();
    set(attempt === 0 ? "connecting" : "reconnecting");
    let sock: WebSocketLike;
    try {
      sock = make(opts.url);
    } catch {
      // a factory that throws (a token it could not fetch) must not end reconnecting
      schedule();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      attempt = 0;
      set("open");
      if (beat) pulse = setInterval(() => ping(sock), beat.intervalMs);
    };
    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      if (deadline) {
        clearTimeout(deadline); // anything at all proves the socket is alive
        deadline = null;
      }
      const text = typeof ev.data === "string" ? ev.data : "";
      if (!text || (beat && text === beat.pong)) return;
      onMessage(text);
    };
    sock.onerror = () => {
      // every error is followed by a close; that is where recovery happens
    };
    sock.onclose = () => lost(sock);
  }

  /** Come back after the backoff wait (full jitter: a fleet must not reconnect in lockstep). */
  function schedule() {
    const delay = Math.floor(random() * Math.min(maxMs, minMs * 2 ** attempt));
    attempt++;
    set("reconnecting");
    retry = setTimeout(open, delay);
  }

  /** `sock` is gone (closed, or declared dead): forget it and, if still wanted, come back. */
  function lost(sock: WebSocketLike) {
    if (ws !== sock) return; // a late close of an already-replaced socket means nothing
    ws = null;
    clearTimers();
    if (!wanted) return set("closed");
    schedule();
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
    probe() {
      if (ws) ping(ws);
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
