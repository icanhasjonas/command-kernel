import type { ArgValues, Grant } from "@command-kernel/core";
import { failure } from "./client-error.js";
import { type ConnectionOptions, type ConnectionStatus, createConnection } from "./connection.js";
import type { EventSpec, HttpRoute, WireSpec } from "./define.js";
import { type FetchLike, httpCall } from "./http.js";
import type { CallFrame, ServerFrame } from "./protocol.js";
import { createSocketCalls } from "./socket-calls.js";

/**
 * The client half: `call(spec, args)` reaches a command over the socket when it is
 * open and over HTTP when it is not. A command with a cacheable GET route always
 * goes over HTTP (so the browser can cache it), and so does a call too large for one
 * socket frame. Both transports hand back the same thing: a `data` result's payload,
 * or `{ kind, message, payload }` for any other result. Events pushed by the server
 * arrive through `on(event, handler)`.
 */

export interface WireClientOptions extends Omit<ConnectionOptions, "url"> {
  /** HTTP base, e.g. "https://app.example/api" or "/api" */
  http: string;
  /** socket URL, e.g. "wss://app.example/ws"; omit for HTTP only */
  ws?: string;
  fetch?: FetchLike;
  /** extra HTTP headers per request (auth for a native client) */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** per call, ms (default 15,000) */
  timeoutMs?: number;
  /** a call whose frame is larger than this goes over HTTP instead (default 1 MiB, as the server) */
  maxFrameBytes?: number;
  /**
   * Told about an event handler that threw (`event` is its name) or an `onStatus`
   * listener that threw (`event` is "status"); the others still run, and the
   * connection carries on.
   */
  onError?: (err: unknown, event: string) => void;
}

export interface CallOpts {
  /** force a transport; default: GET route or oversized -> http, open socket -> ws, else http */
  via?: "ws" | "http";
  signal?: AbortSignal;
  /** a grant for a confirm-gated command, minted by the server after a person confirmed */
  evidence?: Grant;
}

export interface WireClient {
  call<A extends object, O>(spec: WireSpec<A, O>, args: A, opts?: CallOpts): Promise<O>;
  /**
   * Ask the server to approve a confirm-gated call and hand back the grant, then
   * pass it as `evidence` on the call itself. The SERVER decides (its `confirm`
   * policy); this only asks.
   */
  confirm<A extends object>(spec: WireSpec<A, unknown>, args: A, opts?: CallOpts): Promise<Grant>;
  /** Call by name, untyped (tools, scripts). */
  callName(name: string, args?: ArgValues, opts?: CallOpts): Promise<unknown>;
  on<D>(event: EventSpec<D>, handler: (data: D) => void): () => void;
  /** Called with the current status at once, then on every change. */
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  readonly status: ConnectionStatus;
  connect(): void;
  /** reconnect now instead of waiting out the backoff (e.g. the network came back) */
  retryNow(): void;
  close(): void;
}

export function createWireClient(opts: WireClientOptions): WireClient {
  const http = {
    base: opts.http.replace(/\/+$/, ""),
    fetch: opts.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init)),
    headers: opts.headers,
    timeoutMs: opts.timeoutMs ?? 15_000,
  };
  const maxFrame = opts.maxFrameBytes ?? 1 << 20;
  const calls = createSocketCalls(http.timeoutMs);
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  let seq = 0;

  function onMessage(text: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    // a frame from something that is not our server must not break the socket
    if (typeof parsed !== "object" || parsed === null) return;
    const frame = parsed as ServerFrame;
    if (frame.t !== "evt" && frame.t !== "ok" && frame.t !== "err") return;
    if (frame.t === "evt") {
      for (const fn of [...(listeners.get(frame.name) ?? [])]) {
        try {
          fn(frame.data);
        } catch (err) {
          opts.onError?.(err, frame.name);
        }
      }
      return;
    }
    calls.answer(frame);
  }

  /** A status listener that throws is reported, never allowed to stop the connection. */
  function tell(fn: (s: ConnectionStatus) => void, s: ConnectionStatus) {
    try {
      fn(s);
    } catch (err) {
      opts.onError?.(err, "status");
    }
  }

  function onConnStatus(s: ConnectionStatus) {
    if (s !== "open") calls.dropAll();
    for (const fn of [...statusListeners]) tell(fn, s);
  }

  const conn = opts.ws
    ? createConnection({ ...opts, url: opts.ws }, onMessage, onConnStatus)
    : null;

  function dispatch(
    name: string,
    args: ArgValues,
    route: HttpRoute | undefined,
    o: CallOpts = {},
    kind: "cmd" | "confirm" = "cmd",
  ) {
    const extras = {
      signal: o.signal,
      evidence: o.evidence,
      ...(kind === "confirm" && { confirm: true }),
    };
    // a confirmation is a POST, never a cacheable GET route
    const httpRoute = kind === "confirm" ? undefined : route;
    if (o.via !== "ws" && (o.via === "http" || httpRoute || !conn?.isOpen))
      return httpCall(http, name, args, httpRoute, extras);
    const id = `c${++seq}`;
    const frame: CallFrame = {
      t: kind,
      id,
      name,
      args,
      ...(o.evidence && { evidence: o.evidence }),
    };
    const text = JSON.stringify(frame);
    // UTF-8 is at most 3 bytes per UTF-16 unit; only measure exactly when it could matter
    const big = text.length * 3 > maxFrame && new TextEncoder().encode(text).byteLength > maxFrame;
    if (big && o.via !== "ws") return httpCall(http, name, args, httpRoute, extras);
    return calls.call(conn, text, id, name, o.signal);
  }

  return {
    call: <A extends object, O>(spec: WireSpec<A, O>, args: A, o?: CallOpts) =>
      // A is the declared arg shape; it IS an arg bag on the wire. O is the declared result.
      dispatch(spec.node.id, args as ArgValues, spec.http, o) as Promise<O>,
    confirm: async <A extends object>(spec: WireSpec<A, unknown>, args: A, o?: CallOpts) => {
      const out = (await dispatch(spec.node.id, args as ArgValues, spec.http, o, "confirm")) as {
        grant?: Grant;
      };
      if (!out?.grant) throw failure("serverFail", `${spec.node.id}: no grant came back`);
      return out.grant;
    },
    callName: (name, args = {}, o) => dispatch(name, args, undefined, o),
    on: <D>(event: EventSpec<D>, handler: (data: D) => void) => {
      const set = listeners.get(event.name) ?? new Set();
      const fn = handler as (data: unknown) => void; // the event's declared payload type
      set.add(fn);
      listeners.set(event.name, set);
      return () => {
        set.delete(fn);
        if (set.size === 0 && listeners.get(event.name) === set) listeners.delete(event.name);
      };
    },
    onStatus: (fn) => {
      statusListeners.add(fn);
      tell(fn, conn?.status ?? "idle"); // a late listener learns where things stand now
      return () => statusListeners.delete(fn);
    },
    get status() {
      return conn?.status ?? "idle";
    },
    connect: () => conn?.start(),
    retryNow: () => conn?.retryNow(),
    close: () => conn?.stop(),
  };
}
