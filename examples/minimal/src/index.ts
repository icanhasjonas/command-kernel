/**
 * The smallest possible example: register commands, then drive them through the
 * kernel + gate — no React, no DOM, no framework. Run it:
 *
 *   bun run --filter '@command-kernel/minimal' start
 *   # or: bun examples/minimal/src/index.ts
 *
 * It shows the whole loop a driver implements: browse -> execute -> (gate ->
 * Allow -> grant -> re-issue) -> result. That loop is identical for the palette,
 * the agent, a deeplink, or this console.
 */
import { type Ctx, createKernel } from "@command-kernel/core";

// 1. REGISTER commands. The kernel hard-codes none; you bring the nodes.
const kernel = createKernel({
  roots: [
    {
      id: "greet",
      title: "Greet a user",
      args: [{ id: "name", label: "name", kind: "string", required: true }],
      run: async ({ name }) => ({ kind: "toast", message: `Hello, ${name}!` }),
    },
    {
      id: "danger.reset",
      title: "Send password reset",
      // a gate declared ONCE on the node; the kernel enforces it for every driver
      gate: { roles: ["admin"], confirm: true, reason: "irreversible — emails a reset link" },
      args: [{ id: "user", label: "user", kind: "email", required: true }],
      run: async ({ user }) => ({ kind: "toast", message: `Reset sent to ${user}` }),
    },
  ],
});

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "Jonas", role: "admin", brand: "circle" },
  now: Date.now(),
  frecency: {},
};

// 2. BROWSE — rank completions for a query.
const browse = await kernel.command({ query: "greet" }, ctx);
if (browse.kind === "completions") {
  console.log(
    "browse 'greet' ->",
    browse.items.flatMap((i) => (i.kind === "command" ? [i.node.id] : [])),
  );
}

// 3. EXECUTE an ungated command — runs straight away.
const greeted = await kernel.command(
  { path: [{ id: "greet", args: { name: "Jonas" } }], execute: true },
  ctx,
);
console.log("greet ->", greeted.kind === "result" && greeted.result.message);

// 4. EXECUTE a gated command with NO evidence — the kernel returns a gate.
const seg = { id: "danger.reset", args: { user: "jon@wall.north" } };
const gated = await kernel.command({ path: [seg], execute: true }, ctx);
console.log("reset (no grant) ->", gated.kind); // "gate"

// 5. The "human" clicks Allow: mint a grant bound to THIS exact command+args,
//    set it as the tip's evidence, and re-issue the IDENTICAL call.
const evidence = kernel.evidence.grantForPath([seg]);
const allowed = await kernel.command({ path: [{ ...seg, evidence }], execute: true }, ctx);
console.log("reset (with grant) ->", allowed.kind === "result" && allowed.result.message);

// 6. Proof you can't fake it: a forged grant bounces back to the gate.
const forged = await kernel.command(
  { path: [{ ...seg, evidence: { nonce: "forged", sig: "deadbeef" } }], execute: true },
  ctx,
);
console.log("reset (forged grant) ->", forged.kind); // "gate" — approval can't be fabricated
