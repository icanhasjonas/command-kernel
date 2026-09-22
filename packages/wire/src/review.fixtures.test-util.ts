import { CommandError, type Ctx, createKernel } from "@command-kernel/core";
import type { WireCallError } from "./client-error.js";
import { defineCommand, implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { createWireServer, type WireServerOptions } from "./server.js";

/** Shared fixtures for the review regression tests (wire review rounds 1-3). */

export const toast = defineCommand<object, never>()({ id: "say.hi", title: "Say hi" });
export const quiet = defineCommand<object, undefined>()({ id: "say.nothing", title: "Nothing" });
export const gated = defineCommand<{ n: number }, { ok: boolean }>()({
  id: "danger",
  title: "Danger",
  gate: { confirm: true },
  args: [{ id: "n", label: "n", kind: "number", required: true }],
});
const thrower = (code: string) =>
  defineCommand<object, never>()({ id: `throw.${code}`, title: code });
const throwers = ["timeout", "weird"].map(thrower);

export const reviewSpecs = [toast, quiet, gated, ...throwers];

/**
 * A server over the review commands; `extra` overrides any option, `specs` included.
 * `now` is the kernel's clock (grant expiry), default the real one.
 */
export function server(extra: Partial<WireServerOptions> = {}, now?: () => number) {
  const kernel = createKernel({
    ...(now && { now }),
    roots: [
      { ...toast.node, run: async () => ({ kind: "toast", message: "hi", payload: { x: 1 } }) },
      implement(quiet, async () => undefined),
      implement(gated, async () => ({ ok: true })),
      ...throwers.map((t) =>
        implement(t, async () => {
          throw new CommandError(t.node.title, "nope");
        }),
      ),
    ],
  });
  return { kernel, wire: createWireServer({ kernel, specs: reviewSpecs, ...extra }) };
}

/** The error a call ended in (a test that expects failure). */
export const failed = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (e: unknown) => e as WireCallError,
  );

export const JSON_TYPE = { "content-type": "application/json" };

/** POST a JSON call (content-type set unless `init.headers` replaces it). */
export const post = (
  w: ReturnType<typeof createWireServer>,
  name: string,
  init: RequestInit = {},
  as: Ctx = ctx,
) =>
  w.handleHttp(
    new Request(`https://x/api/${name}`, { method: "POST", headers: JSON_TYPE, ...init }),
    as,
  );

/** `ctx` as another user. */
export const as = (id: string): Ctx => ({ ...ctx, user: { ...ctx.user, id } });
