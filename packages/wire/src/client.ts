import type { ArgValues } from "@command-kernel/core";
import { type ConnectionOptions, type ConnectionStatus, createConnection } from "./connection.js";
import type { EventSpec, HttpRoute, WireSpec } from "./define.js";
import type { CallFrame, ServerFrame, WireError } from "./protocol.js";
import { fillRoute } from "./route.js";

/**
 * The client half: `call(spec, args)` reaches a command over the socket when it is
 * open and over HTTP when it is not (or when the command declares a cacheable GET
 * route, which always goes over HTTP so the browser can cache it). Events pushed by
 * the server arrive through `on(event, handler)`. One object, both transports.
 */

export class WireCallError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly missing: string[];
  readonly errors: Array<{ argId: string; message: string }>;
  /** true when the same call may simply be retried (it may or may not have run) */
  readonly retryable: boolean;

  constructor(error: WireError) {
    super(error.message);
    this.name = "WireCallError";
    this.code = error.code;
    this.status = error.status;
    this.details = error.details;
    this.missing = error.missing ?? [];
    this.errors = error.errors ?? [];
    this.retryable = ["timeout", "disconnected", "unavailable", "rateLimited"].includes(error.code);
  }
}

export interface WireClientOptions extends Omit<ConnectionOptions, "url"> {
  /** HTTP base, e.g. "https://app.example/api" or "/api" */
  http: string;
  /** socket URL, e.g. "wss://app.example/ws"; omit for HTTP only */
  ws?: string;
  fetch?: typeof fetch;
  /** extra HTTP headers per request (auth for a native client) */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** per call, ms (default 15,000) */
  timeoutMs?: number;
}

export interface CallOpts {
  /** force a transport; default: GET route -> http, open socket -> ws, else http */
  via?: "ws" | "http";
  signal?: AbortSignal;
}

export interface WireClient {
  call<A extends object, O>(spec: WireSpec<A, O>, args: A, opts?: CallOpts): Promise<O>;
  /** Call by name, untyped (tools, scripts). */
  callName(name: string, args?: ArgValues, opts?: CallOpts): Promise<unknown>;
  on<D>(event: EventSpec<D>, handler: (data: D) => void): () => void;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  readonly status: ConnectionStatus;
  connect(): void;
  /** reconnect now instead of waiting out the backoff */
  retryNow(): void;
  close(): void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: WireCallError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const failure = (code: string, message: string) => new WireCallError({ code, message, status: 0 });

export function createWireClient(opts: WireClientOptions): WireClient {
  const http = opts.http.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const pending = new Map<string, Pending>();
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  let seq = 0;

  function onMessage(text: string) {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(text) as ServerFrame; // our own server's frames; `t` routes below
    } catch {
      return;
    }
    if (frame.t === "evt") {
      for (const fn of listeners.get(frame.name) ?? []) fn(frame.data);
      return;
    }
    const p = frame.id ? pending.get(frame.id) : undefined;
    if (!p || !frame.id) return;
    pending.delete(frame.id);
    clearTimeout(p.timer);
    if (frame.t === "ok") p.resolve(frame.data);
    else p.reject(new WireCallError(frame.error));
  }

  function onConnStatus(s: ConnectionStatus) {
    // a call in flight on a socket that dropped may or may not have run: say so
    if (s !== "open") {
      for (const [id, p] of pending) {
        pending.delete(id);
        clearTimeout(p.timer);
        p.reject(failure("disconnected", "The connection dropped before an answer came"));
      }
    }
    for (const fn of statusListeners) fn(s);
  }

  const conn = opts.ws
    ? createConnection({ ...opts, url: opts.ws }, onMessage, onConnStatus)
    : null;

  function viaSocket(name: string, args: ArgValues): Promise<unknown> {
    const id = `c${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(failure("timeout", `${name} did not answer within ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      const frame: CallFrame = { t: "cmd", id, name, args };
      if (!conn?.send(JSON.stringify(frame))) {
        pending.delete(id);
        clearTimeout(timer);
        reject(failure("disconnected", "The socket is not open"));
      }
    });
  }

  async function viaHttp(name: string, args: ArgValues, route?: HttpRoute, signal?: AbortSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
    const headers = { accept: "application/json", ...(await opts.headers?.()) };
    try {
      const res = route
        ? await doFetch(`${http}${fillRoute(route.path, args)}`, { headers, signal: ctrl.signal })
        : await doFetch(`${http}/${encodeURIComponent(name)}`, {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify(args),
            signal: ctrl.signal,
          });
      const text = await res.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        // e.g. an auth proxy answering with its HTML login page: not ours, say so
        throw failure(
          "badResponse",
          `${name}: expected JSON, got ${res.headers.get("content-type") ?? "no content type"} (HTTP ${res.status})`,
        );
      }
      if (res.ok) return body;
      const err = (body ?? {}) as Partial<WireError>; // a problem+json body from our server
      throw new WireCallError({
        code: err.code ?? "serverFail",
        message: err.message ?? `HTTP ${res.status}`,
        status: res.status,
        ...(err.details !== undefined && { details: err.details }),
        ...(err.missing && { missing: err.missing }),
        ...(err.errors && { errors: err.errors }),
      });
    } catch (e) {
      if (e instanceof WireCallError) throw e;
      if (ctrl.signal.aborted && !signal?.aborted) throw failure("timeout", `${name} timed out`);
      throw failure("unavailable", e instanceof Error ? e.message : "Network error");
    } finally {
      clearTimeout(timer);
    }
  }

  function dispatch(name: string, args: ArgValues, route: HttpRoute | undefined, o: CallOpts = {}) {
    const via = o.via ?? (route ? "http" : conn?.isOpen ? "ws" : "http");
    return via === "ws" ? viaSocket(name, args) : viaHttp(name, args, route, o.signal);
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
      return () => set.delete(fn);
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
