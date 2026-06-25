# Research: Universal Command System

> Status: **RESEARCH / DESIGN ONLY.** Nothing built. This captures prior art,
> a proposed architecture, and an honest viability read against the current
> portal2 codebase. Written 2026-06-23.

## 0. The idea (restated)

One **headless command kernel** is the single source of truth for *every action
and navigation in the app*. The UI is decoupled from it: the same kernel is
rendered as a command palette for humans, projected as a tool surface for the AI
agent, bound to keyboard chords for power users, and (optionally) exposed as URL
deeplinks. A command:

- belongs to a **category** (`Users >`, `Forms >`, `Submissions >`, ...),
- **lazily resolves** its sub-items by calling into its module (async OK),
- takes **zero args**, **one positional arg**, or **many named args**,
- can either be **navigated into** (drill into its children) OR **executed**
  directly (Quicksilver-style: clicking the `Search [email: x]` part runs the
  search-as-a-results-page instead of drilling into the matches).

Then the agent uses *this same system* instead of ~20 bespoke tools.

Three properties Jonas pinned down:

1. **Decoupled** -- core renders many ways (palette, agent, chords, deeplink).
2. **FZF + per-item weights + `Cmd/Ctrl+X` chords** on every item.
3. **Context-sensitive** -- the menu changes based on where you are
   (a form, a submission, a file...).

---

## 1. Prior art (this is a well-trodden pattern -- good)

The strongest existing blueprint for "one declaration, many surfaces (incl. an
AI)" is **Apple App Intents**. The closest shipping *web-app* analog is
**Raycast**. The interaction grammar is **Quicksilver**. Context-sensitivity is
**VS Code `when`-clauses** + **GitHub's scope-follows-location** palette. Ranking
is **fzf**. The theory is the **Command pattern / CQRS**.

### 1.1 Apple App Intents -- the canonical "one declaration -> N surfaces + AI"

App Intents is *not a feature, it's a foundation*: you declare an action once
and it becomes available to Siri, Spotlight, Shortcuts, widgets, AND Apple
Intelligence -- no per-surface wiring. The mapping to this design is near 1:1:

| App Intents | This design |
|---|---|
| `AppIntent` type | a command node |
| `@Parameter` | a **named arg** (a "slot") |
| `parameterSummary` | the NL summary the **agent** reads |
| `perform()` async body | the command's `run()` |
| `EntityQuery` / `@EntityQuery` | the **async `resolve()`** that lazily lists sub-items |
| `AppEntity` | a resolved sub-item (a user, a submission) |
| `AppShortcut` | a chord / pinned entry point |

Takeaway: **make the arg schema the keystone.** App Intents gets Siri, Spotlight
*and* Apple Intelligence for free precisely because the parameter declaration is
machine-readable. Our equivalent is a JSON Schema / Zod arg schema that drives
palette arg-chips, validation, *and* the LLM tool params at once.
([App Intents docs](https://developer.apple.com/documentation/appintents),
[Get to know App Intents WWDC25](https://developer.apple.com/videos/play/wwdc2025/244/),
[Bring your app to Siri WWDC24](https://developer.apple.com/videos/play/wwdc2024/10133/))

### 1.2 Raycast -- root commands + arguments + AI-as-tool-caller

Raycast is the proof that this works in a keyboard-first app shell:

- **Root commands** grouped by extension (= our categories).
- **Command arguments**: runtime values prompted before the command runs
  (= our args; positional + named).
- **AI Extensions**: an extension *exposes its commands as tools*; you
  `@mention` an extension (scopes to a category), type natural language, and the
  AI "figures out which tool to call, with what arguments, and runs it." You can
  **chain** extensions in one prompt.

This is exactly "the agent uses the command system instead of bespoke tools,"
already shipped. Note the `@extension` scoping = a way to point the agent at a
*category* so it doesn't have to reason over the whole tree at once.
([AI Extensions](https://manual.raycast.com/ai/ai-extensions),
[Core concepts](https://developers.raycast.com/ai/learn-core-concepts-of-ai-extensions),
[MacStories hands-on](https://www.macstories.net/reviews/hands-on-with-raycasts-new-ai-extensions/))

### 1.3 Quicksilver -- the object -> action -> argument grammar (Jonas's ref)

Quicksilver's three-pane **noun -> verb -> indirect-object** model is the
interaction grammar for "Users > Search [email] > {match} > Send Password
Reset". Two things to lift directly:

- **Plugin/provider architecture**: each plugin supplies items + the actions
  valid on them. That's our per-module lazy `resolve()`.
- **Comma multi-select**: select N items in the object pane, one action runs on
  all -- the answer to "operate on many results at once."

It also validates the **navigate-vs-execute** split: you either drill the
object pane or fire the verb. ([Quicksilver -- Universal Access and
Action](https://dundalek.com/entropic/quicksilver/),
[arg counts PR](https://github.com/quicksilver/Quicksilver/pull/1815))

### 1.4 VS Code + GitHub -- context-sensitivity prior art

- **VS Code `when`-clauses + context keys**: every command/keybinding has a
  boolean `when` predicate evaluated against the current context
  (`editorFocus`, `resourceExtname == .yml`, custom keys you set). This is the
  mechanism for "menu sensitive to where the user is." VS Code's **Quick Pick**
  API is the multi-step arg-collection flow.
- **GitHub command palette**: "scope determined by your current location," shown
  top-left; you can narrow/expand/replace the scope by editing the path, or
  `Tab` to add the highlighted item to the scope. This is the UX pattern for
  context-scoped search + drill-in.
  ([GitHub command palette](https://docs.github.com/en/get-started/accessibility/github-command-palette))

### 1.5 cmdk -- the palette renderer to build on

`cmdk` (Paco Coursey) is the composable combobox primitive behind Linear,
Vercel, Raycast(web), Sourcegraph. Supports grouped items, **nested submenus**
(swap the data source on drill-in, or keep a breadcrumb context stack), async
items, custom renderers, per-item shortcuts. This is the obvious palette
front-end; it is *just one renderer* over the kernel, not the kernel.
([cmdk](https://github.com/pacocoursey/cmdk),
[awesome-command-palette](https://github.com/stefanjudis/awesome-command-palette))

### 1.6 fzf -- the ranking model for "FZF + custom weights"

fzf's scoring is a good base to copy: `scoreMatch=16`, `gapStart=-3`,
`gapExtension=-1`, **bonuses at word boundaries / camelCase transitions**, and a
**tiebreak chain** (length, chunk, pathname, begin, end, index). For our
purpose, the final rank is a blend:

```
score = fzfMatch(query, item)            // 0 if no fuzzy match -> filtered out
      + item.weight                      // static per-item priority (authoring)
      + contextBoost(item, ctx)          // dynamic: location-relevant items rise
      + frecency(item, user)             // learned recency*frequency (Raycast-style)
```

Tiebreak with an fzf-like chain. The static `weight` + `contextBoost` are exactly
the "custom priority weights" ask. ([fzf algo](https://deepwiki.com/junegunn/fzf/2.2-fuzzy-matching-algorithm),
[algo.go](https://github.com/junegunn/fzf/blob/master/src/algo/algo.go))

### 1.7 Theory -- Command pattern / CQRS / intent+slot

- **Command pattern (GoF) / CQRS**: reify each action as a serializable object
  with a handler. Serializability is *why* the same command can fire from the
  palette, the agent, a URL, a chord, or an audit replay -- it's data, not a
  closure.
- **Intent + slot** (Alexa, Dialogflow, App Intents): named args == slots; the
  same NLU shape LLMs already tool-call against.
- **MCP**: tools-as-a-registry. The agent adapter (below) could even expose the
  command tree *as an MCP server* if we ever want external agents to drive it.

---

## 2. Proposed architecture (headless kernel + renderers)

```
                    ┌──────────────────────────────────┐
                    │     COMMAND KERNEL (headless)      │
                    │  pure TS, no React/Monaco/Worker   │
                    │                                    │
                    │  registry: CommandNode[]           │
                    │  list(ctx) / search(q, ctx)        │
                    │  resolveChildren(node, args, ctx)  │  <- async, lazy
                    │  execute(node, args, ctx)          │
                    │  rank(items, q, ctx)  (fzf+weights)│
                    └──────────────────────────────────┘
                       ▲          ▲          ▲         ▲
            ┌──────────┘   ┌──────┘    ┌─────┘    ┌────┘
   ┌────────┴───────┐ ┌────┴─────┐ ┌───┴──────┐ ┌─┴───────────┐
   │ PALETTE        │ │ AGENT    │ │ CHORDS    │ │ DEEPLINKS    │
   │ (cmdk, human)  │ │ ADAPTER  │ │ Cmd/Ctrl+X│ │ /cmd/...      │
   │ arg-chips +    │ │ -> LLM   │ │ keymap    │ │ URL -> exec   │
   │ breadcrumb nav │ │ tools    │ │           │ │               │
   └────────────────┘ └──────────┘ └───────────┘ └──────────────┘
```

### 2.1 The node interface (illustrative -- NOT built)

```ts
interface CommandNode {
  id: string;                       // stable, dot-namespaced: "users.search"
  title: string;                    // human label
  category?: string;                // parent id; root nodes have none
  keywords?: string[];              // extra fuzzy-match fodder
  weight?: number;                  // static priority (the "custom weight")
  chord?: string;                   // e.g. "mod+x u" -> jump straight here

  // context-sensitivity: shown/boosted only where relevant
  when?: (ctx: Ctx) => boolean;     // VS Code-style predicate
  boost?: (ctx: Ctx) => number;     // dynamic rank bump for the current location

  // args: zero | one positional | many named -- ONE schema, drives everything
  args?: JSONSchema;                // positional via x-positional:true on one prop

  // Quicksilver split:
  resolve?: (args, ctx) => Promise<CommandNode[]>;  // drill IN (lazy sub-items)
  run?:     (args, ctx) => Promise<CommandResult>;  // EXECUTE (side effect/page)
}
```

`resolve` present -> the row is **navigable** (has a `>`). `run` present -> the
row is **executable**. Both present -> Quicksilver behavior: `Enter`/click on the
chevron drills in; click/`Cmd+Enter` on the command body executes (e.g. "open
the search as a results page"). A node can be a pure **provider** (`resolve`
only, e.g. `Users > Search`) or a pure **action** (`run` only, e.g. `Send
Password Reset Email`).

### 2.2 The args schema is the keystone (App Intents lesson)

One schema per command feeds **four** consumers, zero duplication:

1. Palette: render `[email: ____]` arg-chips + inline validation.
2. Agent: become the tool's `inputSchema` (already how `defineTool` works here).
3. Deeplink: parse/serialize `/cmd/users.search?email=...`.
4. Audit/replay: the executed command is a serializable `{id, args}` record.

Reuse the existing Zod stack (`packages/schema`) -- the *same* schemas that power
Monaco red-squigglies. Positional arg = one required prop flagged
`x-positional`; named args = the other props; zero args = empty schema.

### 2.3 Context object (the "where am I" input)

```ts
interface Ctx {
  location: { view: ViewId; recordId?: string; path?: string }; // current tab
  selection?: unknown[];        // highlighted rows (Quicksilver comma-select)
  dirtyBuffer?: { path; content };
  user: { id; role; brand };
}
```

Context drives three things: `when` (visibility), `boost` (ranking), and
**arg pre-binding** -- on a submission record, `submissions.resync` arrives with
`{submissionId}` already filled from `ctx.location.recordId`, so the human (or
the agent) doesn't re-specify it. This is GitHub's "scope = current location"
made executable.

### 2.4 Agent adapter -- the "very little tools" part (with a caveat)

Two ways to project the tree to the LLM; recommend a **hybrid**:

- **(a) Generic navigator -- 3 tools total.** `command_search(query, ctx)`,
  `command_resolve(id, args)`, `command_execute(id, args)`. The agent walks the
  *same tree the human walks*. This is literally Jonas's "very little tools" and
  matches Raycast's `@mention -> NL -> AI picks the call` flow. Maximally DRY.
- **(b) Auto-promoted leaf tools.** Each executable leaf is emitted as a
  first-class tool (`users_send_password_reset`, args schema = params). This is
  how `build-agent.ts` works today.

**Radical-candor caveat:** option (a) alone usually makes the agent *worse*, not
better. LLMs tool-call far more reliably against named, well-described tools than
against a generic `execute(path, args)` where the model must first discover the
path. So: ship the 3 navigator tools **and** auto-promote the high-traffic /
high-stakes commands to real tools. Net effect is still one registry, one arg
schema, no hand-written duplicate tool defs -- but you keep reliability. "Fewer
tools" is the wrong success metric; **"one source of truth, derived everywhere"**
is the real win.

---

## 3. Viability against the current codebase (honest)

### 3.1 What makes this EASY (the bones are already here)

- **`view-registry.tsx`** already maps modules -> views with lazy
  `React.lazy()` components, titles, icons, and `@view/<id>` routing. That's 80%
  of a category registry; each `ViewDef` just needs a `commands()` provider
  attached.
- **`build-agent.ts`** already composes tools from per-domain **maker
  functions** returning `defineTool({ description, inputSchema: Zod, execute })`.
  That *is* the node shape (description + args + run). The agent adapter would
  generate these instead of hand-writing them.
- **Zod everywhere** already -- arg schemas double as Monaco-validating schemas.
- **The palette today is trivial/static** (`CommandPalette.tsx`: a `useMemo`
  list of "Go to {view}" + two hard-coded actions, bespoke ARIA combobox, no
  args, no nesting, no async). Low blast radius to replace -- nothing to migrate
  away from.
- **Tab/route sync is solid** -- `openView(store, viewKey(id))` + URL effect.
  A command's `run` for navigation reuses this verbatim.

### 3.2 What's genuinely HARD / the honest risks

1. **"Very little tools" is half-true.** You don't delete tool definitions, you
   *relocate* them into the command registry and auto-derive them. The agent's
   reliability still depends on each command having a crisp description + arg
   schema. Budget for writing good descriptions; a generic navigator alone will
   regress quality (see 2.4).
2. **Over-abstraction trap.** A fully generic command DSL can become harder to
   author than a plain function + a `defineTool`. Keep `CommandNode` tiny; lean
   on existing Zod; resist a bespoke meta-config language. If authoring a command
   is more ceremony than today's maker functions, the design failed.
3. **Decoupling discipline.** The kernel must be a **plain TS package**
   (`packages/commands`?) with *zero* React/Monaco/Worker imports, or the
   "render many ways" promise dies. Renderers import the kernel, never the
   reverse. This is a real constraint the current `apps/web`-local code doesn't
   enforce.
4. **Context plumbing.** A reliable `Ctx` (current view, record id, selection,
   dirty buffer, role/brand) must be threaded to *both* the palette and the
   agent. The agent already has VFS/selection context; the palette has the
   store. Unifying the `Ctx` shape across the two is the fiddly integration bit.
5. **Permissions = security surface.** Today read-only agent tools auto-allow;
   mutations (`resync`, `sync_connection`, `restore_version`) prompt. Routing
   the agent through commands means the **`when`/auto-allow gating must live in
   the kernel**, not the renderer -- otherwise the agent could execute a command
   the human UI would have gated. This must be designed in from the start, not
   bolted on.
6. **Async-resolve UX in two front-ends.** Lazy `resolve()` is natural in cmdk
   (spinner on drill-in) but for the agent it becomes a multi-call dance
   (`search -> resolve -> execute`), i.e. several tool round-trips for one human
   action. Fine, but it's not free -- it's latency + tokens.

### 3.3 Suggested migration order (if/when we build)

1. **Kernel + palette only.** Wrap the 7 existing views as providers; replace
   `CommandPalette.tsx`. No args, no agent yet. Pure win, low risk.
2. **Args + context.** Add arg schemas (start with `Users > Search`), the `Ctx`
   object, `when`/`boost`, fzf ranking + weights, chords.
3. **Agent adapter.** Add the 3 navigator tools + auto-promote ~6 hot commands;
   run *alongside* the existing 20 tools; A/B the agent's success rate; retire
   bespoke tools only as their command equivalents prove out.
4. **Deeplinks / context-menus** as further renderers, free at this point.

Each stage is independently shippable and green-gateable.

---

## 4. One-line verdict

The pattern is sound and well-proven (App Intents and Raycast are this exact
thesis in production), and portal2's bones -- lazy view registry, Zod-typed
`defineTool` makers, solid tab/route sync -- fit it unusually well. The two
things that will bite are (a) believing "very little tools" means *better* agent
(it doesn't without auto-promoted named tools) and (b) keeping the kernel
genuinely headless + the permission gating *in* the kernel. Build it palette-first
in `packages/commands`, prove the agent adapter alongside the existing tools, and
don't invent a config DSL.

---

## Sources

- [App Intents | Apple Developer](https://developer.apple.com/documentation/appintents)
- [Get to know App Intents -- WWDC25](https://developer.apple.com/videos/play/wwdc2025/244/)
- [Bring your app to Siri -- WWDC24](https://developer.apple.com/videos/play/wwdc2024/10133/)
- [Raycast AI Extensions](https://manual.raycast.com/ai/ai-extensions)
- [Raycast AI core concepts](https://developers.raycast.com/ai/learn-core-concepts-of-ai-extensions)
- [Raycast AI Extensions hands-on -- MacStories](https://www.macstories.net/reviews/hands-on-with-raycasts-new-ai-extensions/)
- [Quicksilver -- Universal Access and Action](https://dundalek.com/entropic/quicksilver/)
- [Quicksilver argument-counts PR](https://github.com/quicksilver/Quicksilver/pull/1815)
- [GitHub Command Palette](https://docs.github.com/en/get-started/accessibility/github-command-palette)
- [cmdk](https://github.com/pacocoursey/cmdk) / [awesome-command-palette](https://github.com/stefanjudis/awesome-command-palette)
- [fzf fuzzy matching algorithm](https://deepwiki.com/junegunn/fzf/2.2-fuzzy-matching-algorithm) / [algo.go](https://github.com/junegunn/fzf/blob/master/src/algo/algo.go)
</content>
</invoke>
