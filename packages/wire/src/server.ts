import type { ArgValues, Ctx, Grant, Kernel } from "@command-kernel/core";
import { argGuards } from "./arg-guards.js";
import { overLimit, readGrant } from "./body.js";
import { frameId } from "./frame-id.js";
import { httpHandler } from "./http-handler.js";
import { type CallOptions, type Outcome, refused, runCall, thrown } from "./outcome.js";
import { encodeFrame, type OkFrame, serverStatus } from "./protocol.js";
import { dataOf, jsonText, refusal, UNSENDABLE } from "./reply.js";
import { compileRoutes } from "./route.js";
import { checkSpecs, type ServedSpec } from "./spec-checks.js";

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
   * `args` are the ones the grant is signed over: prefilled and coerced, not as sent.
   */
  confirm?: (call: { name: string; args: ArgValues; ctx: Ctx }) => boolean | Promise<boolean>;
  /**
   * Its grants are checked by the kernel's evidence store. A server with more than one
   * isolate, or a Durable Object that hibernates, MUST give every kernel the same
   * `createHmacEvidenceStore(sharedKey)`: the default key is per store, one process only.
   */
  kernel: Kernel;
  /**
   * The declarations, and the ALLOWLIST: only these commands are callable, on both
   * transports. Any other node in the kernel answers exactly as a command that does
   * not exist. Those with an `http` GET route are also served at their path. Refused
   * at construction: an id outside [A-Za-z0-9._-] or of only dots, a GET route on a
   * node that does not declare `effect: "pure"`, and a route param that is not an arg.
   */
  specs: ReadonlyArray<ServedSpec>;
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
   * runs the command: missing or bad args answer `invalidArguments` exactly as the
   * call would, and a call that owes no confirm is a `conflict`.
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
  checkSpecs(opts.specs);
  const base = (opts.base ?? "/api").replace(/\/+$/, "");
  const maxBytes = opts.maxBytes ?? 1 << 20;
  const beat = opts.heartbeat === undefined ? { ping: "ping", pong: "pong" } : opts.heartbeat;
  const commandIds = new Set(opts.specs.map((s) => s.node.id));
  const routes = compileRoutes(
    opts.specs.flatMap((s) => (s.http ? [{ id: s.node.id, route: s.http }] : [])),
  );
  // an undeclared command answers word for word as one that does not exist
  const unknown = (name: string) => refusal("unknownCommand", `No command ${name}`);

  const guards = argGuards(opts.specs);

  const call = async (name: string, args: ArgValues, ctx: Ctx, evidence?: Grant) => {
    if (!commandIds.has(name)) return unknown(name);
    return guards.check(name, args) ?? runCall(opts.kernel, name, args, ctx, evidence, opts);
  };

  /** The gate's verdict for a call (a dry run: never executed), turned into a grant when the host allows it. */
  async function approve(
    confirm: NonNullable<WireServerOptions["confirm"]>,
    name: string,
    args: ArgValues,
    ctx: Ctx,
  ): Promise<Outcome> {
    const res = await opts.kernel.command(
      { path: [{ id: name, args }], execute: true, dryRun: true },
      ctx,
    );
    // missing or bad args answer exactly as the call itself would (invalidArguments)
    if (res.kind === "result")
      return refusal("conflict", `${name} is not waiting for a confirmation`);
    if (res.kind !== "gate") return refused(res, name);
    if (!res.verdict.allowed) return refusal("forbidden", `Not allowed: ${res.node.title}`);
    if (!res.verdict.needsConfirm)
      return refusal("conflict", `${name} is not waiting for a confirmation`);
    // the policy decides on exactly what the grant signs: after prefill and coercion
    if (!(await confirm({ name, args: res.args, ctx })))
      return refusal("forbidden", `${res.node.title} was not confirmed`);
    const grant = opts.kernel.grantFor(res);
    return { ok: true, result: { kind: "data", message: "confirmed", payload: { grant } } };
  }

  async function confirmCall(name: string, args: ArgValues, ctx: Ctx): Promise<Outcome> {
    if (!commandIds.has(name)) return unknown(name);
    if (!opts.confirm) return refusal("forbidden", "Confirmations are not enabled here");
    const refusedArgs = guards.check(name, args);
    if (refusedArgs) return refusedArgs;
    try {
      return await approve(opts.confirm, name, args, ctx);
    } catch (err) {
      // a throwing policy, gate or prefill answers as a throwing run() does
      return thrown(err, name, opts);
    }
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
    if (evidence === "invalid") return bad(id, "evidence must be {nonce, sig, expiresAt?}");

    const args = parsed.args ?? {};
    const outcome =
      parsed.t === "confirm"
        ? await confirmCall(parsed.name, args, ctx)
        : await call(parsed.name, args, ctx, evidence);
    if (!outcome.ok) return encodeFrame({ t: "err", id, error: outcome.error });
    const r = outcome.result;
    const data = dataOf(r);
    const ok: OkFrame = { t: "ok", id, kind: r.kind, message: r.message };
    // a result JSON cannot hold (a BigInt, a cycle) is the same serverFail HTTP answers
    const text = jsonText(data === undefined ? ok : { ...ok, data });
    return text ?? encodeFrame({ t: "err", id, error: UNSENDABLE });
  }

  return {
    confirmCall,
    handleHttp: httpHandler({ base, maxBytes, commandIds, routes, call, confirmCall }),
    handleFrame,
    event: (name, data) => encodeFrame({ t: "evt", name, ...(data !== undefined && { data }) }),
  };
}
