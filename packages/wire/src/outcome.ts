import {
  type ArgValues,
  type CommandResult,
  type Ctx,
  type Grant,
  isCommandError,
  type Kernel,
} from "@command-kernel/core";
import { serverStatus, type WireError } from "./protocol.js";

/**
 * One call through the kernel, reduced to "it ran, here is the result" or "it
 * did not, here is a WireError". Both transports use this and nothing else, so a
 * command behaves identically over HTTP and over a socket.
 */

export type Outcome = { ok: true; result: CommandResult } | { ok: false; error: WireError };

export interface CallOptions {
  /** status for a CommandError code the built-in table does not know */
  statusFor?: (code: string) => number | undefined;
  /** called with anything a run() threw that was not a CommandError */
  onError?: (err: unknown, name: string) => void;
}

function fail(code: string, message: string, extra: Partial<WireError> = {}): Outcome {
  return { ok: false, error: { code, message, status: serverStatus(code), ...extra } };
}

export async function runCall(
  kernel: Kernel,
  name: string,
  args: ArgValues,
  ctx: Ctx,
  evidence: Grant | undefined,
  opts: CallOptions = {},
): Promise<Outcome> {
  try {
    const res = await kernel.command(
      { path: [{ id: name, args, ...(evidence !== undefined && { evidence }) }], execute: true },
      ctx,
    );
    switch (res.kind) {
      case "result":
        return { ok: true, result: res.result };
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
        // `details` is what a host needs to mint a grant (kernel.grantFor) once a person confirms
        return res.verdict.allowed
          ? fail("confirmRequired", `${res.node.title} needs a confirmation`, {
              checks: res.verdict.checks,
              details: { args: res.args, priorKey: res.priorKey },
            })
          : fail("forbidden", `Not allowed: ${res.node.title}`, { checks: res.verdict.checks });
      case "completions":
        // execute:true answers with completions only when the tip is missing or cannot run
        return res.at
          ? fail("unknownCommand", `${name} cannot be run`)
          : fail("unknownCommand", `No command ${name}`);
    }
  } catch (err) {
    if (isCommandError(err)) {
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
    opts.onError?.(err, name);
    // never echo an unexpected exception: it can carry internals
    return fail("serverFail", "Something went wrong running this command");
  }
}
