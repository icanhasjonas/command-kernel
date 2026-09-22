import type { ArgError, ArgValues } from "@command-kernel/core";
import type { Outcome } from "./outcome.js";
import { serverStatus } from "./protocol.js";
import { routeParams, unfitParam } from "./route.js";
import type { ServedSpec } from "./spec-checks.js";

/**
 * Args the wire refuses before the kernel sees them, the same on every transport
 * (a GET, a POST, a socket frame), with the `invalidArguments` a bad arg gets.
 */

function invalid(errors: ArgError[]): Outcome {
  return {
    ok: false,
    error: {
      code: "invalidArguments",
      message: errors.map((e) => e.message).join("; "),
      status: serverStatus("invalidArguments"),
      missing: [],
      errors,
    },
  };
}

/** The guards for one server's specs: `check(name, args)` is null when the args may go on. */
export function argGuards(specs: ReadonlyArray<ServedSpec>) {
  const params = new Map(
    specs.flatMap((s) => (s.http ? [[s.node.id, routeParams(s.http.path)] as const] : [])),
  );
  return {
    /**
     * A route param of "", "." or ".." is refused on EVERY transport: over GET it would
     * reach another route, so a POST or a frame must not quietly accept what GET cannot.
     */
    check(name: string, args: ArgValues): Outcome | null {
      const errors: ArgError[] = [];
      for (const p of params.get(name) ?? []) {
        const unfit = unfitParam(args[p]);
        if (unfit) errors.push({ argId: p, message: `${p} ${unfit}` });
      }
      return errors.length ? invalid(errors) : null;
    },
  };
}
