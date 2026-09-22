/** What a connection is built from and what it offers: the socket shape, its statuses, the knobs. */

/** A socket that stays up (connection.ts). */
export interface Connection {
  readonly status: ConnectionStatus;
  /** the server's final close, while closed because of it; null otherwise */
  readonly closedBy: CloseInfo | null;
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

/** Why the server ended the connection for good: the close frame's code and reason. */
export interface CloseInfo {
  code: number;
  reason: string;
}

/** 4000-4999 are the application's own codes (RFC 6455 7.4.2): a reconnect cannot fix them. */
export const APPLICATION_CLOSE = (code: number) => code >= 4000 && code <= 4999;

/** The code and reason of a close event, from any runtime's CloseEvent shape. */
export function closeInfo(ev: unknown): CloseInfo | null {
  const e = ev as { code?: unknown; reason?: unknown } | null;
  if (typeof e?.code !== "number") return null;
  return { code: e.code, reason: typeof e.reason === "string" ? e.reason : "" };
}

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
   * A server close whose code this accepts is final: no reconnect, status "closed", and the
   * code is reported (`closedBy`). Default: 4000-4999, the codes an application closes
   * with on purpose ("signed out", "not a member"). `() => false` reconnects on anything.
   */
  finalClose?: (code: number) => boolean;
  /** WebSocket subprotocols for the default socket factory */
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
