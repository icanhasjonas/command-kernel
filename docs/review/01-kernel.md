# 01 — `@command-kernel/core`

The hero. Correctness, the trust core, and API shape.

---

## K13 — `FallbackSearch` is a seam that does nothing · **P0**

`FallbackSearch` is a public type (`types.ts:202`), a `KernelConfig` field
(`create-kernel.ts:59`), and a `readonly` property on `Kernel`
(`create-kernel.ts:85`). It is documented as *"opt-in fallback when the primary
search yields no results"*.

Nothing calls it. `command()` never reads `deps.fallback`; there is no
`fallback` in `command.ts`, `kernel.ts`, or any driver. A consumer who configures
one gets a stored object and no behaviour.

```
$ grep -rn "fallback" packages/*/src --include='*.ts' | grep -v dist
create-kernel.ts:59,60,85,99,121,149   # store it, expose it
types.ts:197                            # describe it
# ...and that is the complete list
```

This is the worst kind of defect for a package whose product is its extension
contract: a documented capability that silently no-ops.

**Fix.** Either implement it in `command()` — when `req.query` is non-empty and
the ranker returns zero items, call `fallback.search(query, ctx)`, rank the
returned nodes, and tag the response so a driver can label the section — or
delete the type, the config field, and the property. Do not ship it as is.
Implementing is ~10 lines and the `label`/`icon` fields on the interface imply
that was the intent.

---

## K2 — the evidence tag is brute-forceable in ~12 minutes · **P1**

`evidence.ts` signs with 32-bit FNV-1a, rendered as 8 hex characters. The
docblock is upfront that it is "an honesty tag, not a defense", and that is the
right framing — but the *named* threat is specific:

> Its only job: a caller — the agent especially — cannot FABRICATE approval,
> because it can't compute a valid tag without going through the gate.

An in-process caller is exactly the attacker who can brute-force. Measured on
this machine, against the real store:

```
2,000,000 verify calls in 656ms = 3.05M/s
2^32 space -> ~23.5 min to exhaust, ~11.7 min expected
```

`kernel.evidence` is a public readonly property, so a driver has `verify`
directly; without it the same search runs through `kernel.command` at a lower but
same-order rate. Twelve minutes of one core buys a forged approval for a chosen
(command, args, priorKey).

**Fix.** Widen the tag to 128 bits. Four FNV-1a lanes with distinct offset bases
over the same payload, concatenated, keeps it synchronous, dependency-free, and
about four times the cost of nothing:

```ts
const BASES = [0x811c9dc5, 0x01000193, 0x811c9dc7, 0xdeadbeef];
function hash(str: string): string {
  return BASES.map((base) => {
    let h = base;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }).join("");
}
```

That pushes the search past any practical budget while keeping every property the
docblock claims. Keep the "not cryptographic" note — a consumer wanting real
guarantees still swaps in HMAC via the seam — but the *default* should not be
defeatable by a for-loop.

---

## K1 — a lazy provider vanishes when `ctx` is omitted · **P1**

`Registry.roots(ctx?)` skips every function provider when `ctx` is undefined
(`registry.ts:39`). `Kernel.roots(ctx?)` and `Kernel.chords(ctx?)` both take an
optional `ctx` and forward it. So:

```ts
const kernel = createKernel({
  registry: createRegistry(() => [{ id: "z", title: "Z", chord: "z" }]),
});
kernel.roots().length;   // 0
kernel.chords().size;    // 0   <- no error, no warning
```

A registry that mixes static and lazy providers returns a *partial* tree with no
signal that anything was dropped. The chord map is the likely victim: it is the
one call site where omitting `ctx` looks natural.

**Fix.** Make `ctx` required on `Kernel.roots` / `Kernel.chords` /
`Registry.roots`. Pre-1.0 is the moment to do it, and the type error at every
call site is exactly the right amount of noise. If the optional form must stay,
`Registry.roots()` should throw when it has function providers and no context —
silently returning a subset of the command tree is not a defensible default.

---

## K3 — an unresolvable path is indistinguishable from an empty one · **P1**

`command.ts:166`:

```ts
const node = level.find((n) => n.id === seg.id);
if (!node) return { kind: "completions", at: tip, items: [] };
```

A typo'd id, a renamed command, and a category that legitimately has no children
all produce the same response. The DOM-invoker driver already had to invent
`onUnresolved` to cope (`invokers.ts:86`) and even then it cannot tell the two
apart — its own docblock admits it is guessing ("*a typo'd or since-renamed id*").

This matters most for the two surfaces where the path comes from outside the app:
deeplinks and markup. Stale links fail silently.

**Fix.** Add a response kind:

```ts
| { kind: "notfound"; at: CommandNode | null; segment: string; path: string[] }
```

Cheap, additive, and it turns "nothing happened" into a diagnosable event for
every driver at once.

---

## K11 — the audit hook is blind to everything except success · **P2**

`createKernel({ onExecute })` fires only on `res.kind === "result"`
(`create-kernel.ts:122`). For telemetry and undo that is right. For the audit
trail the docblock advertises it is backwards: a security log wants the *denied*
attempts, the gate prompts, and the invalid-arg rejections at least as much as
the successes.

**Fix.** Widen to `onCommand(record, response)` firing on every terminal
response, or add sibling hooks (`onGate`, `onDenied`). Keep `onExecute` as the
success-only convenience if the undo-stack use case wants it.

---

## K6 — `kind: "entity"` and `entity` can disagree · **P2**

`ArgKind` includes `"entity"`, and `ArgSpec.entity` is a separate optional
`EntityRef`. Nothing ties them. The playground's own `users.search` declares
`kind: "entity"` with a hand-rolled `complete` and no `entity` ref
(`examples/playground/src/providers/users.ts:90`).

The consequences are quiet but real:

- `describeArg` reports `{ kind: "entity", options: "async" }` — an agent reading
  the descriptor is told to resolve against a catalog that isn't declared.
- `ruleForNode` treats any `kind === "entity"` arg as the always-allow scope
  anchor, so the standing rule binds to a free-text value.
- `command()`'s `resolveEntities` skips the arg entirely (it keys off `a.entity`),
  so auto-resolution and disambiguation never happen for it.

**Fix.** Pick one representation. Either `kind: "entity"` requires `entity` (and
`createKernel` validates that at registration), or drop the kind and let
`entity !== undefined` be the sole signal. The second is simpler and removes a
whole class of half-configured arg.

---

## K4 — chords and shortcuts only ever scan the root level · **P2**

`collectChords`'s docblock says *"Flatten a node tree's chord bindings"*
(`kernel.ts:128`); it iterates one flat array. Same for `collectShortcuts`, whose
docblock in `create-kernel.ts` claimed filtering by "`when` + gate visibility"
when there is no gate filtering at all. A `chord` or `shortcut` authored on a
child node is silently dead.

Recursion is genuinely awkward here — `resolve` is async, so there is no
synchronous tree to walk. That is a real constraint, not an oversight, but the
docs should say so and the kernel should not accept bindings it will never honour.

**Fix.** Fix the docblocks to say "root level" (partly done in the F3 commit),
and add a dev-mode warning when a node reachable only through `resolve` declares
a `chord`/`shortcut`. If nested bindings are wanted, the honest design is an
explicit `bindings: CommandNode[]` on the config rather than a tree walk.

---

## K10 — `Ranker` is sync while `GatePolicy` is async · **P2**

`GatePolicy` is explicitly `GateVerdict | Promise<GateVerdict>` so a policy can
hit a DB or a flag service. `Ranker` is strictly synchronous. A consumer wanting
a server-side ranker, an embedding search, or BM25 over a remote index has to
pre-warm a cache and pretend.

The asymmetry looks accidental rather than considered. `command()` already
awaits; making the ranker `Ranked[] | Promise<Ranked[]>` costs one `await` and
matches the seam next door. `searchNodes` and `kernel.search` would need the same
treatment, which is the actual cost — the palette's `useMemo` becomes an effect.

Worth doing, worth doing deliberately, and worth documenting either way. Right
now nothing explains why one seam gets async and the other doesn't.

---

## K9 — an unknown role reads as "below everything" · **P2**

`createRoleGate` uses `rankOf[ctx.user.role] ?? -1`. A role that isn't in the
ladder — a typo, a role added to the app but not to the gate — is treated as
lower than the lowest rung. The verdict says `role: admin` failed; it does not
say *your role isn't in the ladder at all*, which is a different bug with a
different fix.

**Fix.** Push an extra check when `rankOf[ctx.user.role] === undefined`:
`{ label: \`unknown role: ${ctx.user.role}\`, ok: false }`. Fails closed, same as
today, but tells the truth.

---

## K5 — intermediate-segment args are second-class · **P2**

The walk in `command()` reassigns `values` at each hop (`command.ts:168`), so
only the tip's args survive into execution. `serializePath` likewise encodes only
the tip's args, documented as deliberate.

The combination means a chain like `forms/forms.pick?slug=x/forms.export?fmt=csv`
cannot round-trip, and `run()` at the tip never sees `slug`. In practice authors
work around it by flattening args onto the tip, which quietly pushes against the
"addressable chain" idea the design is built on.

**Fix.** Either thread a merged bag down the walk (`{...ancestorValues,
...seg.args}`) and encode every segment's args in the deeplink, or state the
one-hop-args constraint in `types.ts` next to `PathSegment` so authors design for
it instead of discovering it.

---

## K8 — deeplink edge cases · **P2**

- `encodeQuery` skips `""` values, so `{ q: "" }` does not round-trip. For a
  search command where empty means "everything", that is a real distinction.
- `parseDeeplink` strips a leading segment equal to the prefix, so a root command
  whose id is literally `cmd` can never be addressed by a deeplink.
- `serializePath([])` returns the bare prefix, and `parseDeeplink` of that
  returns `[]` — fine, but untested.

All three are cheap guards. The prefix collision is worth at least a documented
note in `DeeplinkOptions`.

---

## K7 — the JSON Schema loses detail the arg spec has · **P2**

`toJsonSchema` maps everything to `type: "string"` (or an array of strings for
`multiple`). Not carried over:

- `required` on a `multiple` arg → no `minItems: 1`, so an LLM can satisfy it
  with `[]`.
- `validate` → no `pattern` or description hint, so custom rules are invisible
  until the call is rejected.
- `placeholder` → would make a decent `examples` entry.

The docblock's rationale for flatness (MCP token cost, parse-error rate) is
sound and should stay. These three are flat additions.

---

## K12 — five modules have no unit tests · **P2**

`fuzzy.ts`, `rank.ts`, `registry.ts`, `values.ts` in core, and `adapter.ts` in
agent. `rank` is **seam #1** and the default blend — its weights (`W_WEIGHT 1.1`,
`W_FRECENCY 6`) and its tie-break order (score, then shorter title, then
alphabetical) have zero pinned behaviour. Any change to the blend is currently
unfalsifiable.

`fuzzy` deserves tests for the properties the docblock claims: boundary bonus,
camel bonus, consecutive-run bonus, gap penalty, and the empty-query neutral
match.
