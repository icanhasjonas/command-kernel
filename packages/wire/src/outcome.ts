import {
  type ArgValues,
  type CommandResponse,
  type CommandResult,
  type Ctx,
  type Grant,
  isCommandError,
  type Kernel,
} from "@command-kernel/core";
import { serverStatus, statusOf, type WireError } from "./protocol.js";

/**
 * One call through the kernel, reduced to "it ran, here is the result" or "it
 * did not, here is a WireError". Both transports use this and nothing else, so a
 * command behaves identically over HTTP and over a socket.
 */

export type Outcome = { ok: true; result: CommandResult } | { ok: false; error: WireError };

export interface CallOptions {
  /** status for a CommandError code the built-in table does not know; one that throws is a 500 */
  statusFor?: (code: string) => number | undefined;
  /**
   * Called with anything a run(), gate, prefill or confirm policy threw that was not a
   * CommandError. One that throws is swallowed: the caller still gets its serverFail.
   */
  onError?: (err: unknown, name: string) => void;
  /**
   * Make grants single-use. Called once a grant has verified, just before the command
   * runs: record `nonce` until `expiresAt` (wall-clock ms; after that the grant is
   * refused anyway) and answer true, or answer false when it was already spent, and
   * the call is `confirmRequired`. Without it a grant may be used again until it
   * expires (5 minutes by default).
   */
  spend?: (nonce: string, expiresAt: number) => boolean | Promise<boolean>;
}

function fail(code: string, message: string, extra: Partial<WireError> = {}): Outcome {
  return { ok: false, error: { code, message, status: serverStatus(code), ...extra } };
}

/** True when JSON can carry `v` (JSON.stringify throws on a BigInt or a cycle). */
function sendable(v: unknown): boolean {
  try {
    JSON.stringify(v);
    return true;
  } catch {
    return false;
  }
}

/**
 * What a call that threw answers: a CommandError keeps its code, anything else is a
 * `serverFail` that never echoes the exception (it can carry internals). So is a
 * CommandError whose `details` JSON cannot carry (a BigInt, a cycle): an answer that
 * cannot be written would make the transport itself throw. So is a CommandError with
 * a client-only code (status 0 in ERROR_STATUS): only a client may say `timeout`.
 */
export function thrown(err: unknown, name: string, opts: CallOptions): Outcome {
  if (isCommandError(err) && !sendable(err.details))
    return fail("serverFail", "Something went wrong sending this command's error");
  // a client-only code (timeout, disconnected...) from a run() would read as the CLIENT's
  // own and be retried: it is a server bug, reported and answered like one
  if (isCommandError(err) && statusOf(err.code, 400) !== 0) {
    const status = serverStatus(err.code, opts.statusFor);
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        status,
        ...(err.details !== undefined && { details: err.details }),
      },
    };
  }
  report(opts, err, name);
  return fail("serverFail", "Something went wrong running this command");
}

/** Tell the host's `onError`; one that throws is swallowed, so the caller still gets its answer. */
function report(opts: CallOptions, err: unknown, name: string): void {
  try {
    opts.onError?.(err, name);
  } catch {
    // the reporter itself failed; there is nobody left to tell
  }
}

export async function runCall(
  kernel: Kernel,
  name: string,
  args: ArgValues,
  ctx: Ctx,
  evidence: Grant | undefined,
  opts: CallOptions = {},
): Promise<Outcome> {
  const { spend } = opts;
  try {
    const res = await kernel.command(
      {
        path: [{ id: name, args, ...(evidence !== undefined && { evidence }) }],
        execute: true,
        // a grant a custom store minted without an expiry is remembered for good
        ...(spend && {
          spend: (g: Grant) => spend(g.nonce, g.expiresAt ?? Number.POSITIVE_INFINITY),
        }),
      },
      ctx,
    );
    return res.kind === "result" ? { ok: true, result: res.result } : refused(res, name);
  } catch (err) {
    return thrown(err, name, opts);
  }
}

/** A response that did not run, as the failure both transports answer (call and confirm alike). */
export function refused(res: Exclude<CommandResponse, { kind: "result" }>, name: string): Outcome {
  switch (res.kind) {
    case "args":
      return fail(
        "invalidArguments",
        res.missing.length > 0
          ? `Missing: ${res.missing.join(", ")}`
          : res.errors.map((e) => e.message).join("; "),
        { missing: res.missing, errors: res.errors },
      );
    case "disambiguate":
      return fail("ambiguous", `${res.arg.label} matches several records`, {
        details: { arg: res.arg.id, candidates: res.candidates.map((c) => c.id) },
      });
    case "gate":
      // `details` is what a client needs to SHOW the confirm; never the args, which
      // after prefill can hold server-side values the caller never sent
      return res.verdict.allowed
        ? fail("confirmRequired", `${res.node.title} needs a confirmation`, {
            checks: res.verdict.checks,
            details: { command: res.node.id, title: res.node.title },
          })
        : fail("forbidden", `Not allowed: ${res.node.title}`, { checks: res.verdict.checks });
    case "completions":
      // execute:true answers with completions only when the tip is missing or cannot run
      return res.at
        ? fail("unknownCommand", `${name} cannot be run`)
        : fail("unknownCommand", `No command ${name}`);
  }
}
