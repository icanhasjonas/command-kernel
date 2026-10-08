# @command-kernel/core

The headless command kernel - one source of truth for every action and
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
  args?: ArgSpec[];       // zero | one positional | many named - ONE schema
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

A **`Ctx`** is the "where am I" the caller supplies on every call - location,
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
  | { kind: "args";        node: CommandNode; missing: string[]; errors: ArgError[]; items: Completion[] }
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

- **Validation** - before the gate, `executeNode` runs `validateArgs` against the
  arg schema (email shape, enum membership, custom `validate`). A driver - the
  agent above all - can't run a node with a hallucinated value; the call comes
  back as an `args` response carrying `errors`. An arg the node does not declare is
  refused the same way, naming the key (a `prefill` included), and a `json` arg holds
  plain JSON only (no `Date`, `Map` or class instance). Coercion writes `-0` as `0`,
  and treats a `multiple` arg with no items (`[]`) as absent, on every driver.
- **Gate** (`GatePolicy`) - given a node + ctx, is it allowed and does it still
  owe a confirm? The single enforcement point. May be **sync or async** (hit a DB
  / flag service); `executeNode` awaits it. The default is `createRoleGate(ladder)`
  over a configurable role ladder (`evaluateGate` = viewer < advisor < admin).
- **Evidence** (`EvidenceStore`) - when a human clicks Allow, the store mints a
  `Grant`: an HMAC-SHA256 signature, under a secret 32-byte key, over the EXACT
  `(principal, prior-path, command, canonical args, nonce)`. A caller (the agent
  especially) **cannot fabricate approval** or rework one grant into another: the
  key never leaves the store, so the only way to hold a valid signature is to have
  gone through the gate. Args are bound (approve `email→A` can't run `email→B`); the
  prior path is bound (a grant is valid only inside the chain it was minted in); the
  principal is bound (another user replaying it gets the gate). A grant expires 5
  minutes after it was minted, measured on the kernel's clock (`createKernel({ now })`,
  default `Date.now`; `ctx.now` is never read for it) with the TTL from
  `createHmacEvidenceStore(key, { ttlMs })`, which also caps any grant a store verifies;
  until then it may be reused, unless the caller passes `command({ spend })`
  to allow each nonce once. `rotate()` (or a browser reload) draws a new key and
  invalidates every outstanding grant. The default store's key is random per store; a
  host with several isolates passes one shared key to `createHmacEvidenceStore(key)` in
  each.
- **Policy** (`PolicyStore`) - the standing "always allow" exception, checked
  BEFORE evidence is requested. Scope is `command` (any args), `arg` (this value),
  or `prefix` (this folder), session-scoped. A rule over a list arg matches only when
  it covers EVERY value in the call's list.

`executeNode` runs the order non-negotiably: gate FIRST, then run. A confirm-gated
command runs only when a standing rule matches OR a valid grant is supplied.

## The five extension seams

`createKernel(config)` wires them; each has a default, so zero-config stays
trivial and every override is opt-in.

```ts
createKernel({
  roots,                                   // or `registry`
  ranker:   createRanker({ frecency: 12 }),// SEAM 1 - or any (nodes,q,ctx)=>Ranked[]
  gate:     myOwnershipPolicy,             // SEAM 2 - or any (node,ctx)=>GateVerdict
  evidence: createRedisEvidenceStore(),    // SEAM 3 - implement EvidenceStore
  policy:   createLocalStoragePolicyStore(),// SEAM 4 - implement PolicyStore
  registry: createRegistry(...providers),  // SEAM 5 - lazy provider contribution
});
```

| # | Seam | Type | Default |
|---|---|---|---|
| 1 | Ranking | `Ranker = (nodes, query, ctx) => Ranked[]` | `createRanker()` - fuzzy + weight + boost + frecency |
| 2 | Gate | `GatePolicy = (node, ctx) => GateVerdict \| Promise<…>` | `createRoleGate([...])` (= `evaluateGate`) |
| 3 | Evidence | `EvidenceStore` - sign / verify / grantForPath / rotate | `createMemoryEvidenceStore()` |
| 4 | Policy | `PolicyStore` - allow / revoke / list / clear / match | `createMemoryPolicyStore()` |
| 5 | Providers | `Registry` - register / roots | `createRegistry(...)` |
| 6 | Entities | `EntityType` - search / get (typed-arg catalog) | `createEntityRegistry(...)` |

A seventh, observability seam: `createKernel({ onExecute })` fires a serializable
`CommandRecord` after every successful run - wire audit, telemetry, or an undo
stack in one line. The command has already run when it fires, so a hook that throws
or rejects is swallowed and the caller still gets the result. Typed entities (seam 6) let an arg reference a registered
catalog - `entity: { type: "person", constraint: "with-email-address" }` - which
becomes its completion source and an agent-queryable noun; see
[`docs/entities.md`](../../docs/entities.md).

## The keystone: one arg schema, every surface

The same `ArgSpec[]` that renders the palette's chips also drives:

```ts
import { toJsonSchema, validateArgs, serializePath, parseDeeplink } from "@command-kernel/core";

toJsonSchema(node);          // -> flat, MCP-compatible JSON Schema for an LLM tool's params
validateArgs(node, values);  // -> ArgError[] (email/enum/custom); enforced inside executeNode
serializePath(path);         // -> "cmd/users/users.search?email=x"   (DRIVER #4, deeplinks)
parseDeeplink(url);          // -> PathSegment[]  ->  kernel.command({ path })
```

One declaration, four surfaces, zero duplication.

### Typed args

Text kinds (`string`, `email`, `enum`, `entity`, `text`) hold strings. Three typed kinds
carry real JSON for drivers that have it (the wire, an agent):

```ts
args: [
  { id: "seen", label: "seen", kind: "boolean", required: true },
  { id: "limit", label: "limit", kind: "number" },
  { id: "cursor", label: "cursor", kind: "json", schema: {
      type: "object",
      properties: { box: { type: "string" }, seq: { type: "integer" } },
      required: ["box", "seq"],
      additionalProperties: false,
  } },
]
```

A text-only driver may still send `"true"`, `"25"` or `'{"box":"b","seq":4}'`: the kernel
coerces text to the declared type (`coerceArgs`) before validating, so the palette and a
deeplink reach typed commands unchanged. Unparseable text is left alone and reported by
`validateArgs`. A `json` value is checked against `schema`, and `toJsonSchema` emits that
same schema, so what an agent is told and what the kernel enforces cannot drift.

### Results and errors a program can use

A `run()` that answers a question returns `{ kind: "data", message, payload }`: `payload`
is the answer, `message` a one-line summary. A `run()` that cannot do the thing throws
`new CommandError(code, message, details?)`; drivers act on `code` (`notFound`,
`forbidden`, `conflict`, ...) instead of parsing prose.

### Gates that see the args

`GatePolicy` is `(node, ctx, args?)`. `args` are the effective, coerced values, so a
policy can say "this user may write to box B but not box C". Two-parameter policies keep
working unchanged. A deeplink can carry args but
**never a grant** (the signing key never leaves the kernel), so a URL into a gated
command can't auto-fire - it returns a `gate`. `@command-kernel/agent`'s
`collectTools` turns nodes into MCP `{ name, description, inputSchema }` tools off
the same schema.

## Pipes: one command's output, the next one's input

A node declares what its run hands on (`output: ValueType`, same vocabulary as an
arg) and returns it as `result.value`. A value in flight is a `Piped`
(`{ type, value, label? }`), and it lands in the one arg that accepts its type:

| Verb | What it does |
|---|---|
| `kernel.command({ path, input, execute })` | binds `input` into the tip's args, then everything as usual |
| `kernel.actionsFor(type, ctx, query?)` | every runnable command that takes `type`, walked over free branches, ranked; each with `path`, `priorKey` and the `arg` it lands in |
| `kernel.pipe({ input?, steps }, ctx)` | type-checks every step, then runs them; `done`, `paused` (with a `resume` request) or `broken` (with the reason) |
| `acceptingArg(node, type)` / `bindInput(node, args, piped)` | the routing rule, for a driver that walks itself |

Routing: an entity needs the same entity type, text flows into `text`/`string`
(an `email` is text, text is not an email), a closed `enum` never takes a piped
value, a list only fits a `multiple` arg. A node's `input` names the arg when two
fit. A piped value never outranks a value the caller wrote: two different answers
for one arg come back as an `args` error.

Trust: the value is bound before validation, gate and signing, so it is part of
the grant. Audit records carry `input`, and `replay` binds it again.

## Audit & replay

```ts
const kernel = createKernel({ roots, onExecute: (rec) => log.push(rec) });
// later: re-issue a recorded command (gated ones correctly re-prompt - no smuggled grant)
await replay(kernel, record, ctx);
```

## Write your own provider

A provider contributes root nodes - a static array, or a function of the context
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
queries - mark it `enumerate: "query"` so a scouting agent knows not to blindly
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
    const evidence = kernel.grantFor(res);
    res = await kernel.command({ path: [{ ...seg, evidence }], execute: true }, ctx);
  }

  if (res.kind === "result") return res.result;
}
```

`kernel.grantFor(res)` is the only mint you should need. A `gate` response
carries `args` - the **effective** values, after `prefill` merging and entity
auto-resolution - plus the `priorKey` they bind against, so the grant covers what
will actually run. Signing the args you *typed* (`evidence.grantForPath`) is
correct only when the kernel derives nothing; otherwise verification is checked
against values that never reach your hands and the gate re-asks forever.

A grant is bound to the principal it was minted for (`principal` on the `gate`
response; `createKernel({ principalOf })`, default `ctx.user.id`). Another caller
replaying it gets the gate again: a grant is not a bearer token.

The agent driver does exactly this with `pickTool` from `@command-kernel/agent`;
the palette does it with frames + arg chips in `@command-kernel/ui`. A driver
that tried to skip the gate physically can't - `run` only fires inside
`executeNode`, after the gate.

## Keys by context

One key can mean the right thing in each part of an app: `Escape` discards the draft in an
editor and goes back to the list from a thread; `j` is "next thread" in the list and nothing
while a dialog is open. Declare it on the node, and let the host say which contexts are live:

```ts
const send: CommandNode = {
  id: "mail.send",
  title: "Send",
  shortcut: "mod+enter",
  scope: "composer", // or a list; omitted = "global"
  disabled: (ctx) => (ctx.facts?.draftFilled ? undefined : "Write something to send"),
  run,
};

const kb = createKeyboard();
const scopes = kb.bindScopes({
  nodes,
  scopes: ["global", "list", "thread"], // live by facts, lowest precedence first
  mounted: ["composer", "dialog"], // live while something OPEN mounts them
  ctx: () => ({ ...base, facts: currentFacts() }), // built once per press
  activeScopes: (ctx) => ["global", "list", ...(ctx.facts?.threadOpen ? ["thread"] : [])],
  onActivate: (node, ctx) => void kernel.executeNode(node, {}, ctx),
  onDisabled: (node, reason) => toast(`${node.title}: ${reason}`), // a key never fails silently
});
window.addEventListener("keydown", kb.handleKeydown); // bubble: a widget's own keys go first

// a dialog opens: its commands go on top, and nothing below gets a key except mod+k
const layer = scopes.mount("dialog", { modal: true, passThrough: ["mod+k"] });
kb.popLayer(layer); // it closes
```

The stack's order is a set of numbered, tested laws (a child above its parent whatever order
they mounted in, modal barriers, IME, chords): [docs/keyboard.md](../../docs/keyboard.md#layers).
A React host uses `@command-kernel/react` (`KeyboardProvider`, `KeyboardScope`,
`KeyboardLayer`, `useKeyboardStack`), which pushes and pops layers with the component tree.

- A disabled node (or one hidden by `when`) declines the key: it falls through to the scopes
  below, then to the browser, never prevented for nothing. `executeNode` refuses it too, with
  the reason as the failing check; a palette shows the same reason on the greyed row, and
  `onDisabled` hands it to the host when nothing else took the key (`keyboard.onDeclined` is
  the raw signal: a press whose bindings all declined).
- A printable key aimed at a text field is typing, never a shortcut. `mod` is ⌘ on a Mac and
  Ctrl elsewhere. Named keys (`enter`, `esc`, `down`) and shifted symbols (`?`) match the press.
- A key a widget already handled (`defaultPrevented`) is left alone.
- `shortcutKeys(shortcut)` gives the caps a `<kbd>` hint draws (`[["⌘", "Enter"]]`,
  `[["G"], ["I"]]` for a chord), `formatShortcut` one line, `ariaKeyShortcuts` the attribute.
- `validateShortcuts(nodes)` reports one key bound twice in the SAME scope.

## API reference

**Factory** - `createKernel(config?) => Kernel`. `Kernel` methods: `command`,
`search`, `resolveChildren`, `executeNode`, `grantFor`, `roots`, `chords`,
`shortcuts`, `shortcutConflicts`; and the wired `ranker`, `gate`, `evidence`,
`policy`, `registry`, `entities`, `fallback`.

**The verb** - `command(roots, req, ctx, deps)` (the free form; `kernel.command`
binds `deps`). Types: `CommandRequest`, `CommandResponse`, `Completion`,
`CommandDeps`.

**Lower verbs** - `searchNodes(nodes, query, ctx, ranker?)`,
`resolveChildren(node, args, ctx)`, `executeNode(node, args, ctx, deps,
confirmation?)`, `collectChords(nodes)`, `missingArgs(node, values)`,
`bumpFrecency(frecency, id)`. Types: `ExecuteDeps`, `ExecuteOutcome`,
`Confirmation`.

**Seam 1 - ranking** - `createRanker(weights?)`, `rank` (default), `fuzzyMatch`.
Types: `Ranker`, `RankWeights`, `FuzzyResult`.

**Seam 2 - gate** - `createRoleGate(ladder)`, `evaluateGate` (default),
`isGated(node)`. Type: `GatePolicy` (sync or async).

**Keystone** - `toJsonSchema(node)`, `validateArgs(node, values)`. Types:
`JsonSchemaObject`, `JsonSchemaNode`, `ArgError`.

**Driver #4 - deeplinks** - `serializePath(path, opts?)`,
`parseDeeplink(url, opts?)`. Type: `DeeplinkOptions`.

**Audit / replay** - `toRecord(req, ctx)`, `replay(kernel, record, ctx)`, and the
`createKernel({ onExecute })` hook. Type: `CommandRecord`.

**Seam 3: evidence**: `createMemoryEvidenceStore()` (HMAC-SHA256, random key per
store), `createHmacEvidenceStore(key)` (one shared key across isolates),
`pathKey(segments)`, `bindingKey(principal, priorKey)`, and `hopArgs(node, args, ctx)` +
`hopsKey(hops)` for a driver that walks a chain itself. Type: `EvidenceStore`.

**Seam 4 - policy** - `createMemoryPolicyStore()`, `ruleForNode(node, args)`,
`allowLabel(rule)`. Types: `PolicyStore`, `AllowRule`, `AllowScope`.

**Seam 5 - registry** - `createRegistry(...providers)`. Types: `Registry`,
`Provider`.

**Self-description** - `describeNode(node)`, `describeTree(nodes, ctx?)`,
`enumerateMode(node)`, `effectMode(node)`. Types: `NodeDescriptor`,
`ArgDescriptor`.

**Keyboard** - `createKeyboard(opts?)` (layers with `parent` / `modal` / `passThrough`,
chords, `bindScopes` with facts and `mounted` scopes, `describeStack`, `subscribeStack`),
`validateShortcuts(nodes)`, `normalizeEvent`, `normalizeShortcut`, `canonicalBinding`,
`canonicalKey`, `isEditableTarget`; display: `shortcutKeys`, `formatShortcut`,
`ariaKeyShortcuts` (each takes a `Platform`, default the detected one). Availability:
`disabledReason(node, ctx)`, `nodeScopes(node)`, `GLOBAL_SCOPE`.

**Data model** - `CommandNode`, `ArgSpec`, `ArgOption`, `ArgKind`, `ArgValues`,
`Gate`, `GateVerdict`, `GateCheck`, `Grant`, `PathSegment`, `CommandResult`,
`ResultKind`, `Ctx`, `Fact`, `Role`, `Ranked`, `EnumerateMode`, `EffectMode`.

## License

MIT.
