import type { ArgValues, CommandResult, Ctx, Grant, Kernel } from "@command-kernel/core";
import { overLimit, readGrant, readLimited } from "./body.js";
import type { HttpRoute } from "./define.js";
import { type CallOptions, type Outcome, runCall } from "./outcome.js";
import {
  EVIDENCE_HEADER,
  encodeFrame,
  RESULT_KIND_HEADER,
  serverStatus,
  type WireError,
} from "./protocol.js";
import { compileRoutes, queryArgs } from "./route.js";

/**
 * The server half. It owns no sockets and no auth: the host (a Worker, a Durable
 * Object, Bun.serve) establishes who is calling, builds the `Ctx`, and hands over
 * either an HTTP `Request` or one socket message. Everything else -- routing, args,
 * the gate, errors, status codes, size limits -- is here, once, for both transports.
 */

export interface WireServerOptions extends CallOptions {
  /**
   * Whether a confirm-gated call may be approved now, and by whom. Without it the
   * wire carries grants but cannot mint them, so a confirm-gated command can only be
   * run by a host that mints its own. THE CLIENT NEVER DECIDES: this policy is where
   * a host checks that a person is at the other end (a step-up, a fresh sign-in, an
   * operator's approval), because a client that could approve itself is not a gate.
   */
  confirm?: (call: { name: string; args: ArgValues; ctx: Ctx }) => boolean | Promise<boolean>;
  kernel: Kernel;
  /** the declarations; those with an `http` GET route are served at their path */
  specs?: ReadonlyArray<{ readonly node: { id: string }; readonly http?: HttpRoute }>;
  /** URL prefix for command calls, default "/api" */
  base?: string;
  /** largest accepted HTTP body or socket message, in UTF-8 bytes (default 1 MiB) */
  maxBytes?: number;
  /** the client heartbeat; answered with `pong` (a Durable Object can do it without waking) */
  heartbeat?: { ping: string; pong: string } | false;
}

export interface WireServer {
  /**
   * Mint a grant for a confirm-gated call, if the host's `confirm` policy allows it.
   * Reached over HTTP at `POST {base}/{command}?confirm` and on a socket with
   * `{"t":"confirm", ...}`; the grant then rides the next call as evidence.
   */
  confirmCall(name: string, args: ArgValues, ctx: Ctx): Promise<Outcome>;
  /** Answer an HTTP request under `base`, or null when the path is not ours. */
  handleHttp(request: Request, ctx: Ctx): Promise<Response | null>;
  /** Answer one socket message with the text to send back. */
  handleFrame(message: string, ctx: Ctx): Promise<string>;
  /** Encode a server push for every socket that should see it. */
  event(name: string, data?: unknown): string;
}

function problem(error: WireError): Response {
  const body = { type: `urn:command-kernel:error:${error.code}`, title: error.message, ...error };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}

const refuse = (code: string, message: string) =>
  problem({ code, message, status: serverStatus(code) });

/** The `id` of a frame too big to parse, so an oversized call still settles. */
function frameId(message: string): string | null {
  return /"id"\s*:\s*"([^"]{1,64})"/.exec(message.slice(0, 512))?.[1] ?? null;
}

/** A data result's payload, identical on both transports (absent -> null). */
const dataOf = (r: CommandResult) => (r.kind === "data" ? (r.payload ?? null) : r.payload);

function reply(outcome: Outcome, route?: HttpRoute): Response {
  if (!outcome.ok) return problem(outcome.error);
  const r = outcome.result;
  // a data result's body IS the payload; any other kind is the whole result, and the
  // header says which, so a client never confuses a payload with a result envelope
  const body =
    r.kind === "data" ? dataOf(r) : { kind: r.kind, message: r.message, payload: r.payload };
  const cache = route?.cache === "immutable" ? "private, max-age=31536000, immutable" : "no-store";
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      [RESULT_KIND_HEADER]: r.kind,
    },
  });
}

const refusal = (code: string, message: string): Outcome => ({
  ok: false,
  error: { code, message, status: serverStatus(code) },
});

const isBag = (v: unknown): v is ArgValues =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function createWireServer(opts: WireServerOptions): WireServer {
  const base = (opts.base ?? "/api").replace(/\/+$/, "");
  const maxBytes = opts.maxBytes ?? 1 << 20;
  const beat = opts.heartbeat === undefined ? { ping: "ping", pong: "pong" } : opts.heartbeat;
  const commandIds = new Set((opts.specs ?? []).map((s) => s.node.id));
  const routes = compileRoutes(
    (opts.specs ?? []).flatMap((s) => (s.http ? [{ id: s.node.id, route: s.http }] : [])),
  );
  const call = (name: string, args: ArgValues, ctx: Ctx, evidence?: Grant) =>
    runCall(opts.kernel, name, args, ctx, evidence, opts);

  /** The gate response for a call, turned into a grant when the host allows it. */
  async function confirmCall(name: string, args: ArgValues, ctx: Ctx): Promise<Outcome> {
    if (!opts.confirm) return refusal("forbidden", "Confirmations are not enabled here");
    const res = await opts.kernel.command({ path: [{ id: name, args }], execute: true }, ctx);
    if (res.kind !== "gate")
      return refusal("conflict", `${name} is not waiting for a confirmation`);
    if (!res.verdict.allowed) return refusal("forbidden", `Not allowed: ${res.node.title}`);
    if (!(await opts.confirm({ name, args, ctx })))
      return refusal("forbidden", `${res.node.title} was not confirmed`);
    const grant = opts.kernel.grantFor(res);
    return { ok: true, result: { kind: "data", message: "confirmed", payload: { grant } } };
  }

  async function handleHttp(request: Request, ctx: Ctx): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return null;
    const rest = url.pathname.slice(base.length) || "/";
    const evidence = readGrant(request.headers.get(EVIDENCE_HEADER));
    if (evidence === "invalid") return refuse("badRequest", `${EVIDENCE_HEADER} must be nonce.sig`);

    if (request.method === "OPTIONS") {
      // the host owns CORS; this only answers what the path accepts
      return new Response(null, { status: 204, headers: { allow: "GET, HEAD, POST, OPTIONS" } });
    }
    if (request.method === "GET" || request.method === "HEAD") {
      const hit = routes.match(rest);
      if (!hit) {
        const name = rest.slice(1);
        if (commandIds.has(name))
          return new Response(
            JSON.stringify({
              code: "methodNotAllowed",
              message: `${name} is called with POST`,
              status: 405,
            }),
            {
              status: 405,
              headers: { allow: "POST", "content-type": "application/problem+json; charset=utf-8" },
            },
          );
        return refuse("unknownCommand", `No GET route ${rest}`);
      }
      const res = reply(
        await call(hit.id, { ...queryArgs(url.searchParams), ...hit.params }, ctx, evidence),
        hit.route,
      );
      // HEAD is GET without the body: same status, same headers
      return request.method === "HEAD"
        ? new Response(null, { status: res.status, headers: res.headers })
        : res;
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
    const text = await readLimited(request, maxBytes);
    if (text === null) return refuse("tooLarge", `Body over ${maxBytes} bytes`);
    let args: unknown = {};
    if (text.trim()) {
      try {
        args = JSON.parse(text);
      } catch {
        return refuse("badRequest", "Body is not JSON");
      }
    }
    if (!isBag(args)) return refuse("badRequest", "Body must be a JSON object of args");
    if (url.searchParams.has("confirm")) return reply(await confirmCall(name, args, ctx));
    return reply(await call(name, args, ctx, evidence));
  }

  async function handleFrame(message: string, ctx: Ctx): Promise<string> {
    if (beat && message === beat.ping) return beat.pong;
    const bad = (id: string | null, text: string, code = "badRequest") =>
      encodeFrame({ t: "err", id, error: { code, message: text, status: serverStatus(code) } });
    if (overLimit(message, maxBytes))
      // answer the same code HTTP would, and recover the id so the caller's call settles
      return bad(frameId(message), `Message over ${maxBytes} bytes`, "tooLarge");
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return bad(null, "Message is not JSON");
    }
    if (!isBag(parsed)) return bad(null, "Message must be a JSON object");
    const id = typeof parsed.id === "string" ? parsed.id : null;
    if ((parsed.t !== "cmd" && parsed.t !== "confirm") || !id || typeof parsed.name !== "string")
      return bad(id, 'Expected {"t":"cmd","id":string,"name":string,"args"?:object}');
    if (parsed.args !== undefined && !isBag(parsed.args)) return bad(id, "args must be an object");
    const evidence = readGrant(parsed.evidence);
    if (evidence === "invalid") return bad(id, "evidence must be {nonce, sig}");

    const args = parsed.args ?? {};
    const outcome =
      parsed.t === "confirm"
        ? await confirmCall(parsed.name, args, ctx)
        : await call(parsed.name, args, ctx, evidence);
    if (!outcome.ok) return encodeFrame({ t: "err", id, error: outcome.error });
    const r = outcome.result;
    const data = dataOf(r);
    return encodeFrame({
      t: "ok",
      id,
      kind: r.kind,
      message: r.message,
      ...(data !== undefined && { data }),
    });
  }

  return {
    confirmCall,
    handleHttp,
    handleFrame,
    event: (name, data) => encodeFrame({ t: "evt", name, ...(data !== undefined && { data }) }),
  };
}
