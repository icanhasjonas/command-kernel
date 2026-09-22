import type { ArgValues, Ctx, Kernel } from "@command-kernel/core";
import type { HttpRoute } from "./define.js";
import { type CallOptions, type Outcome, runCall } from "./outcome.js";
import {
  type CallFrame,
  type ErrFrame,
  type EventFrame,
  encodeFrame,
  statusOf,
  type WireError,
} from "./protocol.js";
import { matchRoute, queryArgs } from "./route.js";

/**
 * The server half. It owns no sockets and no auth: the host (a Worker, a Durable
 * Object, Bun.serve) establishes who is calling, builds the `Ctx`, and hands over
 * either an HTTP `Request` or one socket message. Everything else -- routing,
 * args, the gate, errors, status codes -- is here, once, for both transports.
 */

export interface WireServerOptions extends CallOptions {
  kernel: Kernel;
  /** the declarations; only those with an `http` GET route are read here */
  specs?: ReadonlyArray<{ readonly node: { id: string }; readonly http?: HttpRoute }>;
  /** URL prefix for command calls, default "/api" */
  base?: string;
  /** largest accepted HTTP body or socket message, in characters (default 1,048,576) */
  maxSize?: number;
}

export interface WireServer {
  /** Answer an HTTP request under `base`, or null when the path is not ours. */
  handleHttp(request: Request, ctx: Ctx): Promise<Response | null>;
  /** Answer one socket message. Returns the frame to send back. */
  handleFrame(message: string, ctx: Ctx): Promise<string>;
  /** Encode a server push for every socket that should see it. */
  event(name: string, data?: unknown): string;
}

const JSON_TYPE = "application/json; charset=utf-8";

function problem(error: WireError): Response {
  const body = { type: `urn:command-kernel:error:${error.code}`, title: error.message, ...error };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}

function refuse(code: string, message: string): Response {
  return problem({ code, message, status: statusOf(code) });
}

function cacheHeader(route: HttpRoute | undefined): string {
  return route?.cache === "immutable" ? "private, max-age=31536000, immutable" : "no-store";
}

/** A data result answers with its payload; anything else with the whole result. */
function reply(outcome: Outcome, route?: HttpRoute): Response {
  if (!outcome.ok) return problem(outcome.error);
  const { result } = outcome;
  const body = result.kind === "data" ? (result.payload ?? null) : result;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": JSON_TYPE, "cache-control": cacheHeader(route) },
  });
}

function isArgBag(v: unknown): v is ArgValues {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createWireServer(opts: WireServerOptions): WireServer {
  const base = (opts.base ?? "/api").replace(/\/+$/, "");
  const maxSize = opts.maxSize ?? 1 << 20;
  const routes = (opts.specs ?? []).flatMap((s) =>
    s.http ? [{ id: s.node.id, route: s.http }] : [],
  );
  const call = (name: string, args: ArgValues, ctx: Ctx, frame?: Partial<CallFrame>) =>
    runCall(opts.kernel, name, args, ctx, frame?.evidence, opts);

  async function handleHttp(request: Request, ctx: Ctx): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return null;
    const rest = url.pathname.slice(base.length) || "/";

    if (request.method === "GET") {
      for (const { id, route } of routes) {
        const params = matchRoute(route.path, rest);
        if (params)
          return reply(await call(id, { ...queryArgs(url.searchParams), ...params }, ctx), route);
      }
      return refuse("unknownCommand", `No GET route ${rest}`);
    }
    if (request.method !== "POST")
      return refuse("methodNotAllowed", "Use POST, or GET on a declared route");

    let name: string;
    try {
      name = decodeURIComponent(rest.slice(1));
    } catch {
      return refuse("badRequest", "Malformed command name");
    }
    if (!name || name.includes("/")) return refuse("unknownCommand", `No command at ${rest}`);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > maxSize) return refuse("tooLarge", `Body over ${maxSize} characters`);
    const text = await request.text();
    if (text.length > maxSize) return refuse("tooLarge", `Body over ${maxSize} characters`);
    let args: unknown = {};
    if (text.trim()) {
      try {
        args = JSON.parse(text);
      } catch {
        return refuse("badRequest", "Body is not JSON");
      }
    }
    if (!isArgBag(args)) return refuse("badRequest", "Body must be a JSON object of args");
    return reply(await call(name, args, ctx));
  }

  async function handleFrame(message: string, ctx: Ctx): Promise<string> {
    const bad = (id: string | null, text: string): string =>
      encodeFrame({
        t: "err",
        id,
        error: { code: "badRequest", message: text, status: 400 },
      } satisfies ErrFrame);
    if (message.length > maxSize) return bad(null, `Message over ${maxSize} characters`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return bad(null, "Message is not JSON");
    }
    if (!isArgBag(parsed)) return bad(null, "Message must be a JSON object");
    const frame = parsed as Partial<CallFrame>; // an object; every field is checked below
    const id = typeof frame.id === "string" ? frame.id : null;
    if (frame.t !== "cmd" || !id || typeof frame.name !== "string")
      return bad(id, 'Expected {"t":"cmd","id":string,"name":string,"args"?:object}');
    if (frame.args !== undefined && !isArgBag(frame.args)) return bad(id, "args must be an object");

    const outcome = await call(frame.name, frame.args ?? {}, ctx, frame);
    if (!outcome.ok) return encodeFrame({ t: "err", id, error: outcome.error });
    const { result } = outcome;
    return encodeFrame({
      t: "ok",
      id,
      kind: result.kind,
      message: result.message,
      ...(result.payload !== undefined && { data: result.payload }),
    });
  }

  return {
    handleHttp,
    handleFrame,
    event: (name, data) =>
      encodeFrame({ t: "evt", name, ...(data !== undefined && { data }) } satisfies EventFrame),
  };
}
