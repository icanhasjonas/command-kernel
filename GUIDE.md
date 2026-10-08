# GUIDE — bringing an app's *entire* surface under the kernel

> An implementation guide written for an **agent to read, consume, and execute**.
> If you are an LLM or a developer porting an app onto `@command-kernel/core`,
> this is the playbook. It is prescriptive on purpose: follow it top to bottom and
> the result satisfies the covenant below.

Read [`CLAUDE.md`](CLAUDE.md) (the covenant + layout) and the
[`README`](README.md) (the thesis) first. This document is the *how*: how to model
100% of an app as commands, how to expose them so a human progresses from palette
→ chord → deeplink, and how an agent discovers and drives them without bespoke glue.

---

## THE GOAL (canonical)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  EVERY action and navigation in the app is ONE command node in ONE kernel.   ┃
┃                                                                              ┃
┃  100% of buttons, menu items, nav targets, settings toggles, bulk actions,   ┃
┃  searches, and form submissions are reachable as commands. Nothing is        ┃
┃  command-only-in-the-palette and nothing is UI-only-and-uncommandable.       ┃
┃  One source of truth, rendered many ways.                                    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

The payoff is two-sided and both sides fall out of the *same* node set:

1. **Humans progress in place.** A novice opens the palette (`⌘K`), fuzzy-searches,
   fills arg chips. The same person, a week later, fires the same command by chord
   (`⌘J` then a key). A power user pastes a deeplink. Same command, three speeds —
   the UI is a *driver*, not a second definition.
2. **Agents are self-discoverable.** An LLM given the kernel's projection can walk
   the whole tree (`search` → `resolve` → `execute`), read each node's machine
   description (what it is, whether running it *changes* anything, what args it
   needs, what the gate requires), and act — through the **identical gate** the
   human hits. No app-specific tool glue, no second permission path.

If a feature exists in the app but cannot be expressed as a command, the goal is
not met. That is the bar.

---

## SUCCESS — what "done" actually means

Done is **not** "the palette opens." Done is every box below checked:

- [ ] **Total coverage.** Every user-triggerable action and every navigation
      target is a `CommandNode`. Pick 10 things a user can do in the real UI at
      random — all 10 resolve to a command path. No exceptions parked as "later."
- [ ] **One gate, no bypass.** Every state-changing command declares a `gate` and
      is executed *only* through `kernel.command(...)`. No driver can run a command
      the gate would block. The human palette and the agent share **one** kernel
      instance.
- [ ] **One schema per command.** Each command's `args` drive palette chips, the
      agent tool's params, the deeplink parse/serialize, and audit replay — defined
      **once** on the node, never duplicated per surface.
- [ ] **Self-describing.** Every node carries a `summary` (what it is + what lives
      under it) and correct `effect`/`enumerate` hints, so `describeNode` tells an
      agent the truth without it having to run anything to find out.
- [ ] **Three speeds work.** The *same* command is reachable by (a) palette search,
      (b) chord, and (c) deeplink URL — and the gated ones still hit the gate from
      all three.
- [ ] **An agent completes a real task end-to-end** through the projection —
      including correctly *stopping* at a gate it cannot self-approve.
- [ ] **Green gate passes.** `bun run check` (biome → tsc → bun test) is clean.

When all of those hold, the app's surface *is* the kernel, and you're done.

---

## The mental model (the atom)

Everything is a `CommandNode` — plain data plus up to two async hooks:

```ts
interface CommandNode {
  id: string;            // stable, dot-namespaced — "users.send_reset"
  title: string;         // human label
  summary?: string;      // AGENT-facing: what this is + what lives under it
  args?: ArgSpec[];      // THE keystone schema (drives every surface)
  gate?: Gate;           // permission, declared ONCE; the kernel enforces it
  chord?: string;        // single key after the chord leader (⌘J) -> jump here
  resolve?: (args, ctx) => Promise<CommandNode[]>;  // present => NAVIGABLE (drill in)
  run?:     (args, ctx) => Promise<CommandResult>;  // present => EXECUTABLE (do it)
  // hints: enumerate ("free"|"query"), effect ("pure"|"writes"), when, boost, prefill, weight, keywords, icon
}
```

Two hooks, two capabilities:

| Hook present | Capability | Surface meaning |
|---|---|---|
| `resolve` | **navigate** — list children | a menu / category / search branch |
| `run` | **execute** — perform an action | a button / action / form submit |
| both | navigate *and* execute | a thing you can open *or* fire directly |
| neither | (invalid — give it one) | — |

The **one verb** addresses these as a chain from the root:

```ts
await kernel.command({ path, query, execute, role }, ctx)
//   -> { kind: "completions" }  rank children at the tip (browse)
//   -> { kind: "args" }         required args missing/invalid (collect them)
//   -> { kind: "disambiguate" } an entity arg matched many candidates
//   -> { kind: "gate" }         human approval owed (model CANNOT self-approve)
//   -> { kind: "result" }       it ran
```

A `path` is `PathSegment[]` — each segment is a node id, the args bound at that
hop, and (for gated tips) the `evidence` grant proving that hop was approved.

---

## The 100% rule — model every surface element

Map each thing in the app to a node shape. This table is the conversion key:

| App surface element | Becomes | Key fields |
|---|---|---|
| Button / action | leaf with `run` | `run`, `args` if it needs input |
| Nav target / route | leaf with `run: navigate` result | `run` returns `{ kind: "navigate" }` |
| Menu / category | branch with `resolve` (static children) | `resolve`, `enumerate: "free"` |
| Search box (over a backend) | branch with a `positional` arg + `resolve` | `enumerate: "query"` |
| Settings toggle | two-state or `enum`-arg command | `args: [{ kind: "enum", enumValues }]` |
| Form submit | leaf with one `arg` per field | `args`, `validate` per field |
| Destructive / privileged action | gated leaf | `gate: { roles, confirm, reason }` |
| Bulk action ("message these 3") | `multiple` arg (listOf) | `args: [{ multiple: true, ... }]` |
| "Act on a Person/record" | `entity`-typed arg | `args: [{ kind: "entity", entity: { type } }]` |
| Context-only action (this record) | `when` + `prefill` | `when(ctx)`, `prefill(ctx)` |

Rules of thumb while converting:

- **A category that only groups is `resolve`-only** (no `run`). A category you can
  also "open" gets both.
- **Never invent a value an agent could hallucinate.** If an arg picks a real thing
  (a person, a submission), make it `kind: "entity"` and back it with an entity
  catalog — the agent resolves it via `discover`, it doesn't guess an id.
- **Declare the gate on the node, once.** Do not re-check permissions in a driver.
  If you're writing an `if (user.role === ...)` in the UI, that's the bug the
  covenant exists to prevent.
- **Set `effect` and `enumerate` honestly.** They default sensibly (`run` + gate →
  `"writes"`; positional arg → `"query"`) but an agent trusts them to decide what's
  safe to do for discovery. A `pure` node mislabeled is a lie an agent will act on.

---

## Progressive disclosure — one node, three speeds

The same command set serves novice → expert without a second definition:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⌘K   palette      fuzzy search + arg chips      ← discoverability      │
│  ⌘J   chord        leader + node.chord key       ← muscle memory        │
│  URL  deeplink     /cmd/users.send_reset?...      ← share / automate    │
└─────────────────────────────────────────────────────────────────────────┘
        same CommandNode · same args schema · same gate
```

- **Palette (`⌘K`)** — `kernel.command({ query }, ctx)` returns ranked completions;
  the human types, the kernel fuzzy-ranks (frecency-boosted), arg chips collect
  required args. Zero memory needed; this is the on-ramp.
- **Chords (`⌘J` + key)** — give hot commands a `chord`. `kernel.chords(ctx)`
  returns the `Map<key, node>`. The driver listens for the leader, then the key,
  and jumps straight to the command. Same node the palette shows.
- **Deeplinks** — `serializePath(path)` → a URL; `parseDeeplink(url)` → a path you
  feed straight back into `kernel.command`. A URL carries **args but never a
  grant**, so a deeplink into a gated command still lands at the gate. Shareable,
  bookmarkable, automatable — the same arg schema parses it.

Because all three resolve to the same node and the same `command()` call, a user
graduates from one to the next *without the app changing*. That progression is the
point of representing 100% as commands — there is always a faster path to the same
verb.

---

## Self-discovery — how an agent drives the kernel

An agent never gets a bespoke per-app tool list. It gets the **projection**: four
generic tools plus optional promoted named tools for hot commands.

```ts
import { createProjection } from "@command-kernel/agent";

const projection = createProjection(kernel, { promote: hotCommands });
// projection.tools  -> advertise to the LLM (MCP-shaped {name, description, inputSchema})
// projection.call(name, args, ctx) -> dispatch a chosen tool to the kernel
```

The four verbs let a model walk the *same tree a human does*:

| Tool | Does | Returns |
|---|---|---|
| `search` | rank commands at a level | self-describing items |
| `resolve` | list a node's children (drill) | self-describing items |
| `execute` | run the tip | `result` \| `gate` \| `needs-args` \| `disambiguate` |
| `discover` | search a typed entity catalog | entities (resolve a name → id) |

Each returned item is a `NodeDescriptor` (from `describeNode`) — the machine truth
an agent reads *before* acting:

```ts
{
  id, title, summary,
  navigable,            // can I drill in?
  enumerate,            // "free" (cheap, safe to scout) | "query" (needs a term) | null
  executable,           // can I run it?
  effect,               // "pure" (safe for discovery) | "writes" (changes state) | null
  args,                 // each: kind, required, positional, how options are offered, entity ref
  gate,                 // roles / confirm / reason — what approval costs
  safeToScout,          // navigable + free, no backend hit
}
```

So a scouting agent freely walks `safeToScout` branches to build context, supplies
a search term before enumerating a `"query"` branch, resolves entity args via
`discover` instead of guessing ids, and **stops at any `gate`**.

> **The trust line (non-negotiable):** `execute` returns `kind: "gate"` when human
> approval is owed and **never mints a grant**. The model cannot self-approve. A
> bridge surfaces the gate to its human operator and re-issues approval out of band
> — never as a model-callable tool. This is the same gate, the same grant shape,
> the human hits. It is a security invariant, not a UX nicety.

---

## Implementation playbook (do these in order)

Lay this out as tasks before you start; finish all of them.

1. **Inventory the surface.** List every action, route, menu, setting, search, and
   bulk op in the app. This list is your coverage contract — you'll check against
   it at the end.
2. **Model nodes.** Convert each inventory item using the *100% rule* table. Group
   under `resolve`-only category branches. Give every node a real `summary`.
3. **Define the keystone schema.** One `ArgSpec[]` per command. Use `entity` args
   for anything that references a real record; `enum` for closed choices;
   `validate` for formats (email, etc.); `multiple` for bulk.
4. **Declare gates.** Put `gate: { roles, confirm, reason }` on every state-changing
   or privileged command. Do not gate in any driver.
5. **Wire entity catalogs.** Register each `EntityType` (`search` + `get`) via
   `createKernel({ entities })` so both arg completion and the agent's `discover`
   share one catalog.
6. **Set hints.** `effect` and `enumerate` where the inferred default is wrong;
   `chord` on hot commands; `when`/`prefill` for context-scoped commands; `weight`
   for authoring priority.
7. **Assemble one kernel.** `createKernel({ roots | registry, ...seams })`. Every
   driver imports *this* instance.
8. **Wire the drivers.** Palette (`@command-kernel/ui`), chords
   (`kernel.chords`), deeplinks (`serializePath`/`parseDeeplink`), agent
   (`createProjection`). Each is thin; none re-implements the gate.
9. **Verify against the checklist** below, then `bun run check`.

See [`examples/minimal`](examples/minimal) for the whole browse → execute → gate →
grant → result loop in ~80 lines, and [`examples/playground`](examples/playground)
for the full palette + agent demo.

---

## Authoring checklist (per command)

- [ ] Stable, dot-namespaced `id` (it *is* the agent's tool name and the deeplink key).
- [ ] `title` for humans; `summary` for agents (what it is + what's under it).
- [ ] `args` defined once; `entity` for references, `enum` for closed sets,
      `validate` for formats, `multiple` for bulk.
- [ ] `run` for actions, `resolve` for navigation — at least one.
- [ ] `gate` on anything that writes or is privileged; **never** gated in a driver.
- [ ] `effect`/`enumerate` correct (don't ship a `writes` command labeled `pure`).
- [ ] `chord` on hot commands; reachable by palette **and** deeplink too.
- [ ] Produces something another command could use (text, a file, a person)?
      Declare `output` and return it as `result.value`; that makes it a pipe step.
      Takes two args of the same type? Name the piped one with `input`.
- [ ] A node that stands for a domain object (a row in a list) carries `subject`,
      so it can be piped into every command that takes one.
- [ ] No framework import reached the node definition — `packages/core` stays pure.

---

## The anti-checklist (you are breaking the covenant if…)

- A button/menu/route exists in the UI with **no** command behind it.
- A driver re-checks a permission the gate already owns, or runs a node *around*
  `kernel.command`.
- The same arg schema is written twice (once for chips, once for the agent tool).
- An agent tool is a hand-authored, app-specific MCP definition instead of the
  projection off the registry.
- A node lies in its descriptor (`pure` but writes, `free` but hits a backend).
- A model path can mint or fake a grant. Approval must come from the human, out of
  band, every time.
