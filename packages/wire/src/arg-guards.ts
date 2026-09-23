import type { ArgError, ArgValues, Ctx, Kernel } from "@command-kernel/core";
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

/**
 * The guards for one server's specs: `check(name, args, ctx)` is null when the args may
 * go on. It runs the node's `prefill`, so it can throw: the caller answers that as a
 * throwing run() (serverFail).
 */
export function argGuards(kernel: Kernel, specs: ReadonlyArray<ServedSpec>) {
  const params = new Map(
    specs.flatMap((s) => (s.http ? [[s.node.id, routeParams(s.http.path)] as const] : [])),
  );
  return {
    check(name: string, args: ArgValues, ctx: Ctx): Outcome | null {
      const errors: ArgError[] = [];
      // a route param of "", "." or ".." is refused on EVERY transport: over GET it would
      // reach another route, so a POST or a frame must not quietly accept what GET cannot
      for (const p of params.get(name) ?? []) {
        const unfit = unfitParam(args[p]);
        if (unfit) errors.push({ argId: p, message: `${p} ${unfit}` });
      }
      // a prefilled arg is the server's (from the ctx); the kernel lets args override it,
      // which suits a palette's editable default but would let a caller replace it here.
      // Refused whatever the value: passing an equal one would let a caller probe it. A
      // prefill of undefined or "" set nothing (`recordId ?? ""`), so the caller may.
      const node = kernel.roots(ctx).find((n) => n.id === name);
      const prefilled = node?.prefill ? node.prefill(ctx) : {};
      for (const [k, v] of Object.entries(prefilled)) {
        if (v !== undefined && v !== "" && args[k] !== undefined)
          errors.push({ argId: k, message: `${k} is set by the server and cannot be sent` });
      }
      return errors.length ? invalid(errors) : null;
    },
  };
}
