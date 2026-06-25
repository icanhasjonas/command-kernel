# Command Kernel

> **One headless kernel is the single source of truth for every action and
> navigation in an app.** Render it as a command palette for humans, project it
> as a tool surface for an AI agent, bind it to keyboard chords, expose it as
> URL deeplinks — all from the same four verbs and the same permission gate.

**[▶ Live demo](https://command-system-lab.duplo.workers.dev)** — press `⌘K`.

This is the thesis behind Apple App Intents and Raycast, built as a small, honest
prototype you can read end to end. The kernel is ~700 lines of pure TypeScript
with zero framework imports. The palette and the agent are just two drivers over
it.

---

## The point

```
                    ┌──────────────────────────────────┐
                    │     COMMAND KERNEL (headless)      │
                    │   pure TS, no React / DOM / Worker  │
                    │                                    │
                    │  search(q, ctx)                    │
                    │  resolveChildren(node, args, ctx)  │  ← async, lazy
                    │  executeNode(node, args, ctx)      │
                    │  rank(items, q, ctx) (fzf+weights) │
                    │  gate + evidence  (the trust core) │
                    └──────────────────────────────────┘
                       ▲          ▲          ▲         ▲
            ┌──────────┘   ┌──────┘    ┌─────┘    ┌────┘
   ┌────────┴───────┐ ┌────┴─────┐ ┌───┴──────┐ ┌─┴───────────┐
   │ PALETTE        │ │ AGENT     │ │ CHORDS    │ │ DEEPLINKS    │
   │ (human, cmdk)  │ │ (LLM)     │ │ Cmd/Ctrl+X│ │ /cmd/...      │
   └────────────────┘ └───────────┘ └───────────┘ └──────────────┘
```

> The headless **kernel** is the hero. The palette is just driver #1; the agent
> is driver #2. Both call the same verbs and the same gate.

A command:

- belongs to a **category** (`Users ▸`, `Forms ▸`, `Submissions ▸`, ...),
- **lazily resolves** its sub-items by calling into its module (async OK),
- takes **zero args**, **one positional arg**, or **many named args** — one
  schema drives the palette chips, the agent's tool params, and the deeplink,
- can be **navigated into** (drill into children) OR **executed** directly
  (Quicksilver-style: run `Search [email: x]` as a results page instead of
  drilling).

## The one verb

Everything collapses into a single addressable call every driver shares:

```ts
command(roots, {
  path: [{ id: "users.send_reset",
           args: { user: "jon@wall.north" },
           evidence: grant }],          // minted on Allow
  execute: true,
  role,
}, ctx)
//  => { kind: "result" | "gate" | "args" | "completions", ... }
```

A path addresses a command chain; each call returns EITHER a structured
execution result OR the completions for what comes next. `role` is the principal
for the walk; per-segment `evidence` is the proof a gated hop was approved. The
palette supplies the grant from the human; the agent supplies it from the
operator's Allow. **Same gate, same grant shape, one code path.**

## Evidence — how approval flows through a gate

A path segment is `string | { id, args?, evidence? }`. **Evidence lives on the
segment** — the chain carries its own permissions. When a gated tip runs with no
evidence, `command()` returns `kind: "gate"`. The driver shows the human (or the
agent's operator) the exact command + args + reason; on **Allow** it mints a
`Grant` and re-issues the same call with that grant on the tip.

A grant is a cheap, **session-salted** hash bound to `(command + args + prior
path + nonce)`. It is NOT crypto — its only job is that a caller (the agent
especially) **cannot fabricate approval**: the only way to hold a valid tag is to
have gone through the gate. What falls out for free:

- approve `email → A` can't run `email → B` (args are bound),
- a grant is valid only inside the exact chain it was minted in (prior path bound),
- **reload the tab → new session salt → every grant invalid.** The session
  lifetime IS the TTL. No expiry clock, no revocation list.

**Always allow** is the standing exception, held kernel-side and checked BEFORE
evidence is requested. Scope is `command` (any args), `arg` (this recipient), or
`prefix` (this folder) — session-scoped: "always, for this session."

## Ranking

```
score = fuzzy(query, item)          // fzf-flavoured; 0 = no match -> filtered out
      + item.weight                 // static authoring priority
      + contextBoost(item, ctx)     // location-relevant items rise
      + frecency(item, user)        // learned recency * frequency
```

## Run it

```bash
bun install
bun run dev          # http://localhost:4319
bun run test         # kernel unit tests
bun run check        # the green gate: biome + tsc + vitest
```

## Try

- **⌘K** — open the palette. Fuzzy-type `resend`, `users`, `email`.
- **→ / Enter** — drill into `Users ▸ Search`, type a name, drill a match for actions.
- **⌘↵** — run the search itself as a results page (the Quicksilver split).
- **⌘E** — chord straight into `Send email`; fill the named-arg pills.
- Flip the **role** to `viewer` → `Send password reset` / `Impersonate` lock.
- Switch **context** to `submission · sub_4819` → a context-bound resend floats to
  the top with the id pre-filled.
- Open the **Agent** (top-right) → "reset the password for jon@wall.north" hits
  the identical gate and asks you to Allow.

## Layout

| Path | What |
|---|---|
| `src/kernel/` | pure TS, zero framework imports — the hero |
| `src/providers/` | mock modules that contribute commands |
| `src/ui/` | driver #1 — the human palette |
| `src/agent/` | driver #2 — an agent driving the same kernel |
| `docs/research-universal-command-system.md` | the design research, prior art, honest viability read |

## Status

Prototype / design lab. The kernel, gate, evidence, and policy core are unit
tested; the providers are mocks. The point is to prove the *shape* — one
registry, one arg schema, one gate, derived everywhere — not to ship a product.

## License

MIT.
