# Command Kernel

> **One headless kernel is the single source of truth for every action and
> navigation in an app.** Render it as a command palette for humans, project it
> as a tool surface for an AI agent, bind it to keyboard chords, expose it as
> URL deeplinks — all from the same verbs and the same permission gate.

**[▶ Live demo](https://command-system-lab.duplo.workers.dev)** — press `⌘K`.

This is the thesis behind Apple App Intents and Raycast, built as a small, honest
**reusable package** you can read end to end. The kernel is a few hundred lines
of pure TypeScript with zero framework imports. The palette and the agent are
just two drivers over it — separate packages that depend on the kernel, never the
other way round.

---

## The point

```
                    ┌────────────────────────────────────┐
                    │     @command-kernel/core (headless) │
                    │     pure TS, no React / DOM / Worker │
                    │                                      │
                    │  createKernel({ roots, ...seams })   │
                    │  kernel.command(req, ctx)  ← one verb│
                    │  search / resolveChildren / execute  │
                    │  gate + evidence + policy (trust core)│
                    └────────────────────────────────────┘
                       ▲          ▲          ▲         ▲
            ┌──────────┘   ┌──────┘    ┌─────┘    ┌────┘
   ┌────────┴───────┐ ┌────┴─────┐ ┌───┴──────┐ ┌─┴───────────┐
   │ @ck/ui         │ │ @ck/agent │ │ CHORDS    │ │ DEEPLINKS    │
   │ (human, cmdk)  │ │ (LLM)     │ │ Cmd/Ctrl+X│ │ /cmd/...      │
   └────────────────┘ └───────────┘ └───────────┘ └──────────────┘
```

> The headless **kernel** is the hero AND the shippable artifact. The palette is
> just driver #1; the agent is driver #2. Both call the same verb and the same
> gate. `kernel ⟂ ui` is a real cross-package boundary — a driver cannot reach a
> kernel internal the public surface doesn't expose, and the kernel imports no
> framework. `test/boundary.test.ts` proves it.

## Packages

| Package | What | Depends on |
|---|---|---|
| [`@command-kernel/core`](packages/core) | the headless engine + the five extension seams — **the hero** | nothing |
| [`@command-kernel/ui`](packages/ui) | driver #1, the React command palette | core |
| [`@command-kernel/agent`](packages/agent) | driver #2, the headless kernel-as-tool-surface | core |
| [`examples/playground`](examples/playground) | the full palette + agent demo, composed from the packages | all |
| [`examples/minimal`](examples/minimal) | the smallest example: register one command, run it | core |

## Quick start

```ts
import { createKernel } from "@command-kernel/core";

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

// browse
const top = await kernel.command({ query: "greet" }, ctx); // -> completions
// execute
const out = await kernel.command(
  { path: [{ id: "users.greet", args: { name: "Jonas" } }], execute: true },
  ctx,
); // -> result | gate | args
```

Render it for humans with `@command-kernel/ui`, project it to an LLM with
`@command-kernel/agent` — same kernel, same gate. See
[`packages/core/README.md`](packages/core/README.md) for the full API reference,
the five seams, the trust-core explainer, and the write-your-own-driver /
write-your-own-provider guides.

## The five extension seams

Everything pluggable, each with a sensible default. `createKernel({ roots })` is
stock everything; override any seam in isolation.

| Seam | Swap it for | Default |
|---|---|---|
| `Ranker` | BM25, a learned model, alphabetical | `createRanker()` (fzf blend) |
| `GatePolicy` | your roles, ownership, feature flags | `evaluateGate` (role ladder) |
| `EvidenceStore` | HMAC-SHA, Redis-backed grants | in-memory session-salted |
| `PolicyStore` | localStorage / server always-allow | in-memory session-scoped |
| `Registry` | lazy, context-aware provider contribution | `createRegistry(...)` |

## Develop

```bash
bun install
bun run dev          # playground on http://localhost:4319
bun run test         # bun test (every package + the boundary test)
bun run check        # the green gate: biome + tsc + bun test
bun run build        # bundle the playground
bun run build:packages   # emit publishable dist for each package
```

## Layout

A Bun-workspace monorepo. See [`CLAUDE.md`](CLAUDE.md) for the full map and the
covenant, and [`docs/research-universal-command-system.md`](docs/research-universal-command-system.md)
for the design research, prior art, and honest viability read that birthed this.

## License

MIT.
