# Future-proofing: gaps, prior art, roadmap

> Written 2026-06-25 after the monorepo split. The point of this doc: be honest
> about where the *built* kernel falls short of the *stated* thesis, ground the
> fixes in current prior art, and sequence them.
>
> **Status: Tiers 1 and 2 are SHIPPED** (this pass — gaps G1-G7 all closed). Tier
> 3 is the documented backlog.

## The thesis, restated

One headless kernel is the single source of truth for every action and
navigation. The **arg schema is the keystone**: one declaration drives the
palette chips, the agent's tool params, the deeplink, and audit replay. Every
surface is a driver over the same verbs and the same gate.

## Gap analysis (built vs. claimed)

| # | Claim in the docs | Reality before this pass | Severity |
|---|---|---|---|
| G1 | "one schema drives palette chips, **agent tool params**, deeplink, audit" | `ArgSpec` is a hand-rolled UI shape; it generates **no** JSON Schema for an LLM, **no** deeplink, **no** runtime validation. The keystone was load-bearing in prose only. | **High** — it's the central thesis |
| G2 | "rendered as ... **URL deeplinks**" (4th driver, in every diagram) | Not built. | **High** |
| G3 | the agent is a driver over the kernel | Toy `pickTool`; no standard (MCP-shaped) tool definitions. The agent surface doesn't speak the lingua franca every LLM host now expects. | **High** (future-proofing) |
| G4 | "audit/replay — the executed command is a serializable record" | A path is serializable, but there's no record type, no replay, no execution hook for telemetry/undo. | Medium |
| G5 | reusable package | `Role` is a fixed `"admin"|"advisor"|"viewer"` union baked into core; a consumer's roles don't fit without editing core types. | Medium |
| G6 | gate is the single enforcement point | `GatePolicy` is **sync only**; real apps check permissions against a DB / flag service (async). | Medium |
| G7 | kernel validates what a driver (esp. the agent) sends | Only `missingArgs` (required-presence). A hallucinated email / out-of-enum value runs unchecked. | Medium |

## Prior art (what the future should look like)

- **MCP (Model Context Protocol)** is now the lingua franca for agent tool
  surfaces. A tool is `{ name, description, inputSchema }` where `inputSchema` is
  JSON Schema (`type: "object"`, `properties`, `required`). Guidance: **keep
  schemas flat** — deep nesting raises token cost and parse errors. Our agent
  driver should emit exactly this shape from a `CommandNode`, derived from the
  one arg schema. (spec `2025-06-18`.)
- **Apple App Intents** (WWDC25/26) doubled down on "the schema is the contract
  your app signs with the AI," expanded schemas beyond the assistant
  (Visual Intelligence), and added **`DeferredProperty`** to lower the cost of
  instantiating an entity whose value is an expensive network call — our lazy
  `resolve()` / `enumerate: "query"` is the same idea. They also moved App Intents
  into **Swift Packages** — validating "make it a package."
- **Raycast AI extensions** — `@mention` scopes the agent to a category; the model
  picks the tool + args. Our `collectTools(subset)` is the same scoping lever.
- **fzf / Quicksilver / VS Code `when`** — already reflected in rank / the
  navigate-vs-execute split / `when`.

## Roadmap

### Tier 1 — make the keystone real (thesis-critical) ✅ shipped

1. **`toJsonSchema(node)`** — derive a flat, MCP-compatible JSON Schema from the
   node's `ArgSpec[]`. `email` → `format: "email"`, `enum` → `enum: [...]`, all
   string-valued (matches `ArgValues`). This is the keystone, finally cut.
2. **`validateArgs(node, values)`** — runtime validation (enum membership, email
   shape, custom `validate`). Wired into `command()`'s execute path so a driver —
   the agent above all — can't run a node with bad args; the call bounces to the
   `args` response carrying `errors`.
3. **Deeplinks** — `serializePath` / `parseDeeplink` in core (pure string ↔
   path), driven by the same `ArgSpec`. The sharp security property: a URL
   **cannot carry a signed grant**, so a deeplink into a gated command
   *cannot auto-fire* — it returns a `gate`, and the driver must route to the
   approval UI. Proven by test.
4. **Generic roles** — `Role = string`; `createRoleGate(ladder)` builds the
   default policy; `evaluateGate = createRoleGate(["viewer","advisor","admin"])`.
   A consumer's roles fit without touching core.

### Tier 2 — production-grade trust core + agent surface ✅ shipped

5. **MCP tool projection** — `toMcpTool(node)` / `collectTools(nodes, ctx)` in
   `@command-kernel/agent`, producing standard `{name, description, inputSchema}`
   tools ready to hand to any LLM or wrap in an MCP server.
6. **Async `GatePolicy`** — `(node, ctx) => GateVerdict | Promise<GateVerdict>`,
   so the gate can hit a real permission backend. `executeNode` awaits it.
7. **Audit / replay** — a serializable `CommandRecord`, an `onExecute` hook on
   `createKernel` (telemetry / audit / undo seam), and `replay(kernel, record,
   ctx)`. Replaying a gated mutation correctly re-prompts (no smuggled grant).

### Tier 3 — backlog (documented, not yet built)

- **MCP server transport** — wrap `collectTools` + `command()` in an actual MCP
  server so external agents drive the kernel over stdio/HTTP.
- **Extensible `Ctx`** — a generic slot for app-specific context keys without
  widening core.
- **Open `CommandResult` kinds** — let consumers add result kinds beyond
  toast/page/navigate/noop.
- **Persistence adapters** — localStorage / server-backed `EvidenceStore` +
  `PolicyStore` reference impls (the interfaces already allow them).
- **Undo** — pair a `run` with an `undo` on the node; `CommandRecord` already
  carries enough to drive an undo stack.
- **i18n** — `title`/`label`/`summary` as keys or `(locale) => string`.
- **Non-string arg values** — `ArgValues` is `Record<string,string>` today; a
  typed-value variant (numbers, dates) would deepen the schema but cost the
  all-string simplicity. Defer until a real need.

## Non-goals (holding the line)

Authoring a single command must stay trivial — a `CommandNode` literal, no
ceremony. Every item above is either *derived* from the existing `ArgSpec`
(schema, deeplink, validation, MCP) or *opt-in* via `createKernel` (roles, async
gate, audit). None changes how you write a command. If a future addition makes
authoring heavier, it failed.
