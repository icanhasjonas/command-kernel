# @command-kernel/core

The headless command kernel — one source of truth for every action and
navigation in an app, with five pluggable extension seams. Pure TypeScript, zero
framework imports. This is the hero; every driver (palette, agent, chords,
deeplinks) is a thin renderer over it.

```bash
bun add @command-kernel/core
```

- [Concepts](#concepts)
- [Quick start](#quick-start)
- [The one verb](#the-one-verb-command)
- [The trust core: gate, evidence, policy](#the-trust-core)
- [The five seams](#the-five-extension-seams)
- [Write your own provider](#write-your-own-provider)
- [Write your own driver](#write-your-own-driver)
- [API reference](#api-reference)

## Concepts

A **command** is plain data plus up to two async hooks:

```ts
interface CommandNode {
  id: string;             // stable, dot-namespaced: "users.search"
  title: string;          // human label
  summary?: string;       // machine-readable capability blurb for an agent
  args?: ArgSpec[];       // zero | one positional | many named — ONE schema
  gate?: Gate;            // permission requirement, enforced by the kernel
  when?: (ctx) => boolean;   // visibility predicate
  boost?: (ctx) => number;   // dynamic rank bump for the current location
  prefill?: (ctx) => ArgValues;   // context-provided arg defaults
  resolve?: (args, ctx) => Promise<CommandNode[]>;  // drill IN (=> navigable)
  run?: (args, ctx) => Promise<CommandResult>;      // EXECUTE (=> runnable)
}
```

`resolve` present → the node is **navigable** (drill into children). `run`
present → it is **executable**. Both → Quicksilver behaviour: drill the object or
fire the verb. The **arg schema is the keystone**: one declaration drives palette
arg-chips, the agent's tool params, deeplink parse/serialize, and audit replay.

A **`Ctx`** is the "where am I" the caller supplies on every call — location,
user (id/role/brand), `now`, and learned frecency. It drives `when` (visibility),
`boost` (ranking), and `prefill` (arg pre-binding).

## Quick start

```ts
import { createKernel, type Ctx } from "@command-kernel/core";

const kernel = createKernel({
  roots: [
    {
      id: "users.greet",
      title: "Greet a user",
      args: [{ id: "name", label: "name", kind: "string", required: true }],
      run: async ({ name }) => ({ kind: "toast", message: `Hello, ${name}!` }),
    },
  ],
});

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "Jonas", role: "admin", brand: "circle" },
  now: Date.now(),
  frecency: {},
};

await kernel.command({ query: "greet" }, ctx);           // -> completions
await kernel.command(
  { path: [{ id: "users.greet", args: { name: "Jonas" } }], execute: true },
  ctx,
);                                                        // -> result
```

## The one verb: `command`

Every driver shares a single addressable call:

```ts
kernel.command(req, ctx, roots?) => Promise<CommandResponse>
```

`req` is `{ path?, query?, execute?, role? }`. A `path` addresses a command chain
from the root, each segment binding args and (when needed) `evidence`. The call
EITHER returns a structured execution result OR the completions for what comes
next:

```ts
type CommandResponse =
  | { kind: "completions"; at: CommandNode | null; items: Completion[] }
  | { kind: "args";        node: CommandNode; missing: string[]; items: Completion[] }
  | { kind: "gate";        node: CommandNode; verdict: GateVerdict }
  | { kind: "result";      node: CommandNode; result: CommandResult };
```

`roots` defaults to the kernel's registry/static roots; pass it to walk a
different node set (e.g. the agent's tool subset) through the SAME kernel.

Completions are **self-describing**: every item carries a `NodeDescriptor` (can I
drill in? is that free or does it hit a backend? can I run it? does it write?
what args? what gate?) so an agent navigates the tree without guessing.

## The trust core

Permission enforcement lives in the kernel, never in a driver. The human and the
agent go through the identical path.

- **Gate** (`GatePolicy`) — given a node + ctx, is it allowed and does it still
  owe a confirm? The single enforcement point.
- **Evidence** (`EvidenceStore`) — when a human clicks Allow, the store mints a
  `Grant`: a session-salted hash bound to the EXACT `(command, args, prior-path)`.
  A caller (the agent especially) **cannot fabricate approval** — the salt isn't
  visible, so the only way to hold a valid tag is to have gone through the gate.
  Args are bound (approve `email→A` can't run `email→B`); the prior path is bound
  (a grant is valid only inside the chain it was minted in); `rotate()` (or a
  browser reload) mints a new salt and invalidates every outstanding grant — the
  session lifetime IS the TTL. No expiry clock, no revocation list.
- **Policy** (`PolicyStore`) — the standing "always allow" exception, checked
  BEFORE evidence is requested. Scope is `command` (any args), `arg` (this value),
  or `prefix` (this folder), session-scoped.

`executeNode` runs the order non-negotiably: gate FIRST, then run. A confirm-gated
command runs only when a standing rule matches OR a valid grant is supplied.

## The five extension seams

`createKernel(config)` wires them; each has a default, so zero-config stays
trivial and every override is opt-in.

```ts
createKernel({
  roots,                                   // or `registry`
  ranker:   createRanker({ frecency: 12 }),// SEAM 1 — or any (nodes,q,ctx)=>Ranked[]
  gate:     myOwnershipPolicy,             // SEAM 2 — or any (node,ctx)=>GateVerdict
  evidence: createRedisEvidenceStore(),    // SEAM 3 — implement EvidenceStore
  policy:   createLocalStoragePolicyStore(),// SEAM 4 — implement PolicyStore
  registry: createRegistry(...providers),  // SEAM 5 — lazy provider contribution
});
```

| # | Seam | Type | Default |
|---|---|---|---|
| 1 | Ranking | `Ranker = (nodes, query, ctx) => Ranked[]` | `createRanker()` — fuzzy + weight + boost + frecency |
| 2 | Gate | `GatePolicy = (node, ctx) => GateVerdict` | `evaluateGate` — viewer<advisor<admin + confirm |
| 3 | Evidence | `EvidenceStore` — sign / verify / grantForPath / rotate | `createMemoryEvidenceStore()` |
| 4 | Policy | `PolicyStore` — allow / revoke / list / clear / match | `createMemoryPolicyStore()` |
| 5 | Providers | `Registry` — register / roots | `createRegistry(...)` |

## Write your own provider

A provider contributes root nodes — a static array, or a function of the context
that contributes **lazily** (so a module can decide what to surface based on where
the user is or who they are):

```ts
import { createRegistry, createKernel, type CommandNode } from "@command-kernel/core";

const usersModule: CommandNode[] = [
  {
    id: "users",
    title: "Users",
    resolve: async (_args, _ctx) => [
      { id: "users.invite", title: "Invite user", run: async () => ({ kind: "toast", message: "invited" }) },
    ],
  },
];

const registry = createRegistry(usersModule).register((ctx) =>
  ctx.user.role === "admin" ? [{ id: "danger", title: "Danger Zone" }] : [],
);

const kernel = createKernel({ registry });
kernel.roots(adminCtx);  // [users, danger]
kernel.roots(viewerCtx); // [users]
```

Adding a provider makes its commands appear in EVERY driver at once. For lazy
sub-items (a backend search), give the node a positional arg and a `resolve` that
queries — mark it `enumerate: "query"` so a scouting agent knows not to blindly
enumerate it.

## Write your own driver

A driver is anything that calls `kernel.command(...)` (or the lower verbs) and
renders the response. It owns NO permission logic. Minimal driver:

```ts
async function runGoal(kernel, goal: string, ctx) {
  // 1. find a node (your UI, or an LLM tool-call) -> { id, args }
  const seg = pickSomehow(goal);

  // 2. try to execute
  let res = await kernel.command({ path: [seg], execute: true }, ctx);

  // 3. if the kernel asks for approval, get it from the human, mint a grant,
  //    and RE-ISSUE the identical call with the grant on the tip segment
  if (res.kind === "gate" && res.verdict.allowed && (await askHuman(res))) {
    const evidence = kernel.evidence.grantForPath([seg]);
    res = await kernel.command({ path: [{ ...seg, evidence }], execute: true }, ctx);
  }

  if (res.kind === "result") return res.result;
}
```

The agent driver does exactly this with `pickTool` from `@command-kernel/agent`;
the palette does it with frames + arg chips in `@command-kernel/ui`. A driver
that tried to skip the gate physically can't — `run` only fires inside
`executeNode`, after the gate.

## API reference

**Factory** — `createKernel(config?) => Kernel`. `Kernel` methods: `command`,
`search`, `resolveChildren`, `executeNode`, `roots`, `chords`; and the wired
`ranker`, `gate`, `evidence`, `policy`, `registry`.

**The verb** — `command(roots, req, ctx, deps)` (the free form; `kernel.command`
binds `deps`). Types: `CommandRequest`, `CommandResponse`, `Completion`,
`CommandDeps`.

**Lower verbs** — `searchNodes(nodes, query, ctx, ranker?)`,
`resolveChildren(node, args, ctx)`, `executeNode(node, args, ctx, deps,
confirmation?)`, `collectChords(nodes)`, `missingArgs(node, values)`,
`bumpFrecency(frecency, id)`. Types: `ExecuteDeps`, `ExecuteOutcome`,
`Confirmation`.

**Seam 1 — ranking** — `createRanker(weights?)`, `rank` (default), `fuzzyMatch`.
Types: `Ranker`, `RankWeights`, `FuzzyResult`.

**Seam 2 — gate** — `evaluateGate` (default), `isGated(node)`. Type: `GatePolicy`.

**Seam 3 — evidence** — `createMemoryEvidenceStore()`, `pathKey(segments)`. Type:
`EvidenceStore`.

**Seam 4 — policy** — `createMemoryPolicyStore()`, `ruleForNode(node, args)`,
`allowLabel(rule)`. Types: `PolicyStore`, `AllowRule`, `AllowScope`.

**Seam 5 — registry** — `createRegistry(...providers)`. Types: `Registry`,
`Provider`.

**Self-description** — `describeNode(node)`, `describeTree(nodes, ctx?)`,
`enumerateMode(node)`, `effectMode(node)`. Types: `NodeDescriptor`,
`ArgDescriptor`.

**Data model** — `CommandNode`, `ArgSpec`, `ArgOption`, `ArgKind`, `ArgValues`,
`Gate`, `GateVerdict`, `GateCheck`, `Grant`, `PathSegment`, `CommandResult`,
`ResultKind`, `Ctx`, `Role`, `Ranked`, `EnumerateMode`, `EffectMode`.

## License

MIT.
