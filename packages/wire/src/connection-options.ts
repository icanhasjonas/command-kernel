/** What a connection is built from: the socket shape, its statuses, and the knobs. */

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
  /**
   * How long a socket must STAY open before the backoff starts again from the
   * shortest wait (default 10,000 ms). A server that accepts and drops at once is
   * backed off from, not hammered.
   */
  stableMs?: number;
  /** how long a socket may sit connecting before it is closed and retried (default 10,000 ms) */
  connectTimeoutMs?: number;
  /** liveness checks; `false` turns them off */
  heartbeat?: Heartbeat | false;
  /**
   * WebSocket subprotocols the default socket factory offers. A browser fails the
   * connection when the server echoes none of them: answer the upgrade through
   * `negotiateSubprotocol`. A custom `socket` factory ignores this.
   */
  protocols?: string[];
  /** 0..1, for tests */
  random?: () => number;
}

export const OPEN = 1;
export const DEFAULT_BEAT: Heartbeat = { intervalMs: 25_000, ping: "ping", pong: "pong" };

type SocketCtor = new (url: string, protocols?: string[]) => WebSocketLike;

/** The runtime's own WebSocket (browsers, Workers, Bun, Node 22+). This package ships no DOM lib types. */
export function defaultSocket(protocols: string[] | undefined): (url: string) => WebSocketLike {
  return (url) => {
    // a structural peek, no DOM types. Through `unknown` because each runtime's own WebSocket
    // type (DOM, Workers, Bun) differs from WebSocketLike in ways that do not matter here.
    const Ctor = (globalThis as unknown as { WebSocket?: SocketCtor }).WebSocket;
    if (!Ctor) throw new Error("No global WebSocket here: pass `socket` to createWireClient");
    return new Ctor(url, protocols);
  };
}
