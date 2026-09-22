import type { ArgValues, Grant } from "@command-kernel/core";
import { failure, WireCallError } from "./client-error.js";
import { type ConnectionOptions, type ConnectionStatus, createConnection } from "./connection.js";
import type { EventSpec, HttpRoute, WireSpec } from "./define.js";
import { type FetchLike, httpCall } from "./http.js";
import type { CallFrame, ServerFrame } from "./protocol.js";

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
  /** told about an event handler that threw; the other handlers still run */
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
  /** Call by name, untyped (tools, scripts). */
  callName(name: string, args?: ArgValues, opts?: CallOpts): Promise<unknown>;
  on<D>(event: EventSpec<D>, handler: (data: D) => void): () => void;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  readonly status: ConnectionStatus;
  connect(): void;
  /** reconnect now instead of waiting out the backoff (e.g. the network came back) */
  retryNow(): void;
  close(): void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: WireCallError) => void;
  cleanup: () => void;
}

export function createWireClient(opts: WireClientOptions): WireClient {
  const http = {
    base: opts.http.replace(/\/+$/, ""),
    fetch: opts.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init)),
    headers: opts.headers,
    timeoutMs: opts.timeoutMs ?? 15_000,
  };
  const maxFrame = opts.maxFrameBytes ?? 1 << 20;
  const pending = new Map<string, Pending>();
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  let seq = 0;

  const settle = (id: string) => {
    const p = pending.get(id);
    if (p) {
      pending.delete(id);
      p.cleanup();
    }
    return p;
  };

  function onMessage(text: string) {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(text) as ServerFrame; // our server's frames; `t` routes below
    } catch {
      return;
    }
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
    const p = frame.id ? settle(frame.id) : undefined;
    if (!p) return;
    if (frame.t === "err") return p.reject(new WireCallError(frame.error));
    p.resolve(
      frame.kind === "data"
        ? (frame.data ?? null)
        : { kind: frame.kind, message: frame.message, payload: frame.data },
    );
  }

  function onConnStatus(s: ConnectionStatus) {
    // a call in flight on a socket that dropped may or may not have run: say so
    if (s !== "open") {
      for (const id of [...pending.keys()]) {
        settle(id)?.reject(failure("disconnected", "The connection dropped before an answer came"));
      }
    }
    for (const fn of statusListeners) fn(s);
  }

  const conn = opts.ws
    ? createConnection({ ...opts, url: opts.ws }, onMessage, onConnStatus)
    : null;

  function viaSocket(frameText: string, id: string, name: string, signal?: AbortSignal) {
    return new Promise<unknown>((resolve, reject) => {
      if (signal?.aborted) return reject(failure("aborted", `${name} was cancelled`));
      const onAbort = () => settle(id)?.reject(failure("aborted", `${name} was cancelled`));
      const timer = setTimeout(
        () =>
          settle(id)?.reject(
            failure("timeout", `${name} did not answer within ${http.timeoutMs} ms`),
          ),
        http.timeoutMs,
      );
      signal?.addEventListener("abort", onAbort, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      pending.set(id, { resolve, reject, cleanup });
      if (!conn?.send(frameText))
        settle(id)?.reject(failure("disconnected", "The socket is not open"));
    });
  }

  function dispatch(name: string, args: ArgValues, route: HttpRoute | undefined, o: CallOpts = {}) {
    const extras = { signal: o.signal, evidence: o.evidence };
    if (o.via !== "ws" && (o.via === "http" || route || !conn?.isOpen))
      return httpCall(http, name, args, route, extras);
    const id = `c${++seq}`;
    const frame: CallFrame = {
      t: "cmd",
      id,
      name,
      args,
      ...(o.evidence && { evidence: o.evidence }),
    };
    const text = JSON.stringify(frame);
    // UTF-8 is at most 3 bytes per UTF-16 unit; only measure exactly when it could matter
    const big = text.length * 3 > maxFrame && new TextEncoder().encode(text).byteLength > maxFrame;
    if (big && o.via !== "ws") return httpCall(http, name, args, route, extras);
    return viaSocket(text, id, name, o.signal);
  }

  return {
    call: <A extends object, O>(spec: WireSpec<A, O>, args: A, o?: CallOpts) =>
      // A is the declared arg shape; it IS an arg bag on the wire. O is the declared result.
      dispatch(spec.node.id, args as ArgValues, spec.http, o) as Promise<O>,
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
