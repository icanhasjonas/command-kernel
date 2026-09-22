import type { ArgValues, Ctx, Grant, Kernel } from "@command-kernel/core";
import { overLimit, readGrant } from "./body.js";
import type { HttpRoute } from "./define.js";
import { frameId } from "./frame-id.js";
import { httpHandler } from "./http-handler.js";
import { type CallOptions, type Outcome, runCall } from "./outcome.js";
import { encodeFrame, serverStatus } from "./protocol.js";
import { dataOf, refusal } from "./reply.js";
import { compileRoutes } from "./route.js";

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
   * A grant it mints is bound to the confirming caller (the kernel's `principalOf`).
   */
  confirm?: (call: { name: string; args: ArgValues; ctx: Ctx }) => boolean | Promise<boolean>;
  kernel: Kernel;
  /**
   * The declarations, and the ALLOWLIST: only these commands are callable, on both
   * transports. Any other node in the kernel answers exactly as a command that does
   * not exist. Those with an `http` GET route are also served at their path.
   */
  specs: ReadonlyArray<{ readonly node: { id: string }; readonly http?: HttpRoute }>;
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
   * `{"t":"confirm", ...}`; the grant then rides the next call as evidence. It never
   * runs the command: a call that owes no confirm is a `conflict`.
   */
  confirmCall(name: string, args: ArgValues, ctx: Ctx): Promise<Outcome>;
  /** Answer an HTTP request under `base`, or null when the path is not ours. */
  handleHttp(request: Request, ctx: Ctx): Promise<Response | null>;
  /** Answer one socket message with the text to send back. */
  handleFrame(message: string, ctx: Ctx): Promise<string>;
  /** Encode a server push for every socket that should see it. */
  event(name: string, data?: unknown): string;
}

const isBag = (v: unknown): v is ArgValues =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function createWireServer(opts: WireServerOptions): WireServer {
  const base = (opts.base ?? "/api").replace(/\/+$/, "");
  const maxBytes = opts.maxBytes ?? 1 << 20;
  const beat = opts.heartbeat === undefined ? { ping: "ping", pong: "pong" } : opts.heartbeat;
  const commandIds = new Set(opts.specs.map((s) => s.node.id));
  const routes = compileRoutes(
    opts.specs.flatMap((s) => (s.http ? [{ id: s.node.id, route: s.http }] : [])),
  );
  // an undeclared command answers word for word as one that does not exist
  const unknown = (name: string) => refusal("unknownCommand", `No command ${name}`);

  const call = (name: string, args: ArgValues, ctx: Ctx, evidence?: Grant) =>
    commandIds.has(name)
      ? runCall(opts.kernel, name, args, ctx, evidence, opts)
      : Promise.resolve(unknown(name));

  /** The gate's verdict for a call (a dry run: never executed), turned into a grant when the host allows it. */
  async function confirmCall(name: string, args: ArgValues, ctx: Ctx): Promise<Outcome> {
    if (!commandIds.has(name)) return unknown(name);
    if (!opts.confirm) return refusal("forbidden", "Confirmations are not enabled here");
    const res = await opts.kernel.command(
      { path: [{ id: name, args }], execute: true, dryRun: true },
      ctx,
    );
    if (res.kind !== "gate")
      return refusal("conflict", `${name} is not waiting for a confirmation`);
    if (!res.verdict.allowed) return refusal("forbidden", `Not allowed: ${res.node.title}`);
    if (!res.verdict.needsConfirm)
      return refusal("conflict", `${name} is not waiting for a confirmation`);
    if (!(await opts.confirm({ name, args, ctx })))
      return refusal("forbidden", `${res.node.title} was not confirmed`);
    const grant = opts.kernel.grantFor(res);
    return { ok: true, result: { kind: "data", message: "confirmed", payload: { grant } } };
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
    handleHttp: httpHandler({ base, maxBytes, commandIds, routes, call, confirmCall }),
    handleFrame,
    event: (name, data) => encodeFrame({ t: "evt", name, ...(data !== undefined && { data }) }),
  };
}
