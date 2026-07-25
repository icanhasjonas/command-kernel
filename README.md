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
              ┌──────────────────────────────────────────┐
              │      @command-kernel/core (headless)     │
              │      pure TS, no React / DOM / Worker    │
              │                                          │
              │  createKernel({ roots, ...seams })       │
              │  kernel.command(req, ctx)   ← one verb   │
              │  search / resolveChildren / execute      │
              │  gate + evidence + policy (trust core)   │
              └──────────────────────────────────────────┘
                    ▲          ▲          ▲          ▲
         ┌──────────┘   ┌──────┘    ┌─────┘     ┌────┘
   ┌─────┴──────────┐ ┌─┴─────────┐ ┌┴──────────┐ ┌┴─────────────┐
   │ @ck/ui         │ │ @ck/agent │ │ CHORDS     │ │ DEEPLINKS    │
   │ (human, cmdk)  │ │ (LLM)     │ │ Cmd/Ctrl+X │ │ /cmd/...     │
   └────────────────┘ └───────────┘ └────────────┘ └──────────────┘
```

> The headless **kernel** is the hero AND the shippable artifact. The palette is
> just driver #1; the agent is driver #2. Both call the same verb and the same
> gate. `kernel ⟂ ui` is a real cross-package boundary — a driver cannot reach a
> kernel internal the public surface doesn't expose, and the kernel imports no
> framework. `test/boundary.test.ts` proves it.

## Drivers & the projection

Every surface is a driver over the same four verbs and the same gate. Humans and
chords call the verbs directly; protocol bridges (an MCP server, a raw LLM loop)
consume the **projection** — those same verbs serialized as a tiny generic
tool surface (`createProjection`), so *any* agent drives the kernel with no
bespoke glue. A bridge like MCP is ~50 lines of protocol on top — 100% optional.
Even plain HTML is a driver: native `<button command>` markup routes through the
same gate — see [`docs/dom-invoker.md`](docs/dom-invoker.md) (Driver #5).

```
                    ┌───────────────────────────────────┐
                    │      @command-kernel/core + gate  │   the hero
                    └───────────────────────────────────┘
                                     │
            four verbs:  search · resolve · execute · discover
                                     │
   ┌───────────────┬─────────────┬───┴────────────┬────────────────┐
  human palette   chords      agent panel       MCP bridge      raw LLM loop
  (direct calls)  (direct)    (direct)          (projection)    (projection)
   └───────────────┴─────────────┴────────────────┴────────────────┘
   every surface is a DRIVER · the gate is shared · one source of truth
```

The projection is the **hybrid** the prior art recommends: 4 generic navigator
tools (so an agent walks the whole tree) **plus** auto-promoted named tools for
the high-traffic commands (so tool-calling stays reliable) — both off the one
registry, both through the one gate. `execute` returns a `gate` when human
approval is owed; the model **cannot self-approve**.

## Packages

| Package | What | Depends on |
|---|---|---|
| [`@command-kernel/core`](packages/core) | the headless engine + the six extension seams — **the hero** | nothing |
| [`@command-kernel/ui`](packages/ui) | driver #1, the React command palette | core |
| [`@command-kernel/agent`](packages/agent) | driver #2, the headless kernel-as-tool-surface | core |
| [`examples/playground`](examples/playground) | the full palette + agent demo, composed from the packages | all |
| [`examples/minimal`](examples/minimal) | the smallest example: register one command, run it | core |
| [`examples/mcp-server`](examples/mcp-server) | the "~50 lines" claim, proven: an MCP stdio bridge over the projection | core, agent |
| [`examples/custom-ranker`](examples/custom-ranker) | SEAM 1: a prefix-first Ranker plugged in without forking | core |
| [`examples/persistent-evidence`](examples/persistent-evidence) | SEAM 3+4: file-backed policy/evidence stores + the honest persistence story | core |

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

## The extension seams

Everything pluggable, each with a sensible default. `createKernel({ roots })` is
stock everything; override any seam in isolation.

| Seam | Swap it for | Default |
|---|---|---|
| `Ranker` | BM25, a learned model, alphabetical | `createRanker()` (fzf blend) |
| `GatePolicy` | your roles, ownership, feature flags | `evaluateGate` (role ladder) |
| `EvidenceStore` | HMAC-SHA, Redis-backed grants | in-memory session-salted |
| `PolicyStore` | localStorage / server always-allow | in-memory session-scoped |
| `Registry` | lazy, context-aware provider contribution | `createRegistry(...)` |
| `EntityType` | typed-arg catalog (`Person<'with-email'>`), agent-queryable | `createEntityRegistry(...)` |

## First consumer: portal2

The kernel is dogfooded in [`portal2`](../portal2) -- a production Cloudflare
Workers application managing surrogacy-agency portals. portal2 vendors
`@command-kernel/core` and `@command-kernel/agent` (no npm pin), drives its
entire `/admin` (Backoffice) surface off one `CommandNode` registry, and
contributed the U1-U7 upstream fixes:

- **U7:** `exactOptionalPropertyTypes` -- compiles clean under strict TS.
- **U1:** `usePalette` + `Mode` exported from `@command-kernel/ui`.
- **U2:** Palette tokenized via `--ck-*` CSS custom properties.
- **U3:** `CommandLauncher` -- the nav-replacement trigger button.
- **U4:** Publish script (`scripts/publish.ts`).
- **U5:** Deeplink helper (already in core).
- **U6:** Grant-flow ergonomics (no changes needed after real use).

The vendored files carry **no `@ts-nocheck`** -- the strict-TS fixes are
upstream, not patched locally. Re-sync recipe: `packages/command-kernel-core/PROVENANCE.md`.

## Develop

```bash
bun install
bun run dev          # playground on http://localhost:4319
bun run test         # bun test (every package + the boundary test)
bun run check        # the green gate: biome + tsc + bun test
bun run build        # bundle the playground
bun run build:packages   # emit publishable dist for each package
```

## Bring your app under the kernel

[`GUIDE.md`](GUIDE.md) is the implementation playbook — written for an **agent to
read and execute** — for representing **100% of an app's surface** (every button,
menu, route, setting, search, bulk action) as commands, so a human progresses from
palette (`⌘K`) → chord (`⌘J`) → deeplink, and an agent self-discovers and drives
the same nodes through the same gate. It states the goal, the definition of done,
the 100%-coverage rule, and a step-by-step playbook.

## Layout

A Bun-workspace monorepo. See [`CLAUDE.md`](CLAUDE.md) for the full map and the
covenant, [`GUIDE.md`](GUIDE.md) for the bring-your-app-under-the-kernel playbook,
and [`docs/research-universal-command-system.md`](docs/research-universal-command-system.md)
for the design research, prior art, and honest viability read that birthed this.

## License

MIT.
