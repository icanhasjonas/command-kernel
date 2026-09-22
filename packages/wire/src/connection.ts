import {
  type ConnectionOptions,
  type ConnectionStatus,
  DEFAULT_BEAT,
  defaultSocket,
  OPEN,
  type WebSocketLike,
} from "./connection-options.js";

export type {
  ConnectionOptions,
  ConnectionStatus,
  Heartbeat,
  WebSocketLike,
} from "./connection-options.js";

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
 *
 * Every timer is armed BEFORE the status is reported, so a status listener that
 * throws can never leave a socket unwatched or a reconnect unscheduled.
 */

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

type Timer = ReturnType<typeof setTimeout>;

export function createConnection(
  opts: ConnectionOptions,
  onMessage: (text: string) => void,
  onStatus: (s: ConnectionStatus) => void,
): Connection {
  const make = opts.socket ?? defaultSocket(opts.protocols);
  const minMs = opts.backoff?.minMs ?? 500;
  const maxMs = opts.backoff?.maxMs ?? 15_000;
  const stableMs = opts.stableMs ?? 10_000;
  const connectMs = opts.connectTimeoutMs ?? 10_000;
  const beat = opts.heartbeat === undefined ? DEFAULT_BEAT : opts.heartbeat;
  const pongWait = beat ? (beat.pongWaitMs ?? Math.min(10_000, beat.intervalMs)) : 0;
  const random = opts.random ?? Math.random;

  let ws: WebSocketLike | null = null;
  let status: ConnectionStatus = "idle";
  let attempt = 0;
  let retry: Timer | null = null;
  let pulse: ReturnType<typeof setInterval> | null = null;
  let deadline: Timer | null = null;
  let connecting: Timer | null = null;
  let stable: Timer | null = null;
  let wanted = false;

  const set = (s: ConnectionStatus) => {
    if (s === status) return;
    status = s;
    onStatus(s);
  };
  const clearTimers = () => {
    for (const t of [retry, deadline, connecting, stable]) if (t) clearTimeout(t);
    if (pulse) clearInterval(pulse);
    retry = pulse = deadline = connecting = stable = null;
  };

  /** Give up on `sock` now (it is silent, or never opened), and come back if wanted. */
  function drop(sock: WebSocketLike, code: number, reason: string) {
    lost(sock);
    sock.close(code, reason);
  }

  /** Send a ping and require an answer before `pongWait`. */
  function ping(sock: WebSocketLike) {
    if (!beat || sock.readyState !== OPEN || deadline) return;
    sock.send(beat.ping);
    deadline = setTimeout(() => {
      deadline = null;
      drop(sock, 4000, "no pong");
    }, pongWait);
  }

  function open() {
    clearTimers();
    let sock: WebSocketLike;
    try {
      sock = make(opts.url);
    } catch {
      // a factory that throws (a token it could not fetch) must not end reconnecting
      schedule();
      return;
    }
    ws = sock;
    // a socket stuck connecting (a black-holed network) is closed and retried
    connecting = setTimeout(() => {
      connecting = null;
      drop(sock, 4001, "connect timeout");
    }, connectMs);
    sock.onopen = () => {
      if (ws !== sock) return;
      if (connecting) clearTimeout(connecting);
      connecting = null;
      // the backoff starts over only once the socket has STAYED open
      stable = setTimeout(() => {
        stable = null;
        attempt = 0;
      }, stableMs);
      if (beat) pulse = setInterval(() => ping(sock), beat.intervalMs);
      set("open");
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
    set(attempt === 0 ? "connecting" : "reconnecting");
  }

  /** Come back after the backoff wait (full jitter: a fleet must not reconnect in lockstep). */
  function schedule() {
    const delay = Math.floor(random() * Math.min(maxMs, minMs * 2 ** attempt));
    attempt++;
    retry = setTimeout(open, delay);
    set("reconnecting");
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
