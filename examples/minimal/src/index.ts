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
import { type Ctx, createKernel, parseDeeplink, serializePath } from "@command-kernel/core";

// A typed-entity catalog: register a `person` type once; any arg can reference it.
const PEOPLE = [
  { id: "jon@wall.north", name: "Jon Snow" },
  { id: "sam@castle.black", name: "Sam Tarly" },
];

// 1. REGISTER commands. The kernel hard-codes none; you bring the nodes.
const kernel = createKernel({
  entities: [
    {
      name: "person",
      search: async (q) =>
        PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => ({
          id: p.id,
          label: p.name,
        })),
      get: async (id) => {
        const p = PEOPLE.find((x) => x.id === id);
        return p ? { id: p.id, label: p.name } : null;
      },
    },
  ],
  roots: [
    {
      id: "greet",
      title: "Greet a user",
      args: [{ id: "name", label: "name", kind: "string", required: true }],
      run: async ({ name }) => ({ kind: "toast", message: `Hello, ${name}!` }),
    },
    {
      id: "message",
      title: "Message a person",
      // `to` is a Person reference — the entity catalog is its completion source
      args: [{ id: "to", label: "to", kind: "entity", required: true, entity: { type: "person" } }],
      run: async ({ to }) => ({ kind: "toast", message: `messaged ${to}` }),
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

// 7. DRIVER #4 — deeplinks. The SAME path serializes to a URL and back, driven by
//    the same arg schema. A URL can carry args but never a grant, so a deeplink
//    into a gated command still lands at the gate.
const link = serializePath([seg]);
const fromUrl = await kernel.command({ path: parseDeeplink(link), execute: true }, ctx);
console.log("deeplink ->", link, "->", fromUrl.kind); // "...?user=..." -> "gate"

// 8. The kernel validates what any driver sends — a hallucinated email is rejected
//    BEFORE the gate, as an "args" response carrying the error.
const bad = await kernel.command(
  { path: [{ id: "danger.reset", args: { user: "not-an-email" } }], execute: true },
  ctx,
);
console.log(
  "reset (bad email) ->",
  bad.kind,
  bad.kind === "args" ? bad.errors.map((e) => e.message) : "",
);

// 9. SEAM 6 — typed entities. Executing `message` with no `to` returns an `args`
//    response whose options come from the registered person catalog. The same
//    catalog is what an agent queries to resolve "message jon" -> an id.
const needsPerson = await kernel.command({ path: [{ id: "message" }], execute: true }, ctx);
if (needsPerson.kind === "args") {
  const toArg = needsPerson.items.find((i) => i.kind === "arg" && i.arg.id === "to");
  if (toArg?.kind === "arg") console.log("message -> pick a person ->", toArg.options);
}
const resolved = await kernel.entities?.search("person", "jon", ctx);
console.log("agent resolves 'jon' ->", resolved?.[0]?.id);
