# Typed entities (SEAM #6)

> The App Intents `AppEntity` + `EntityQuery` model, cut to size. An arg can be
> typed as a reference to a registered entity catalog, with an optional
> constraint — the runtime form of `sendEmail(to: Person<'with-email-address'>)`.

## The idea

Before: every arg that needed a lookup carried its own `complete` closure. Two
commands that both take a person re-implemented the search. The agent had no
shared, queryable notion of "a Person."

After: register an `EntityType` once; any arg references it by name.

```ts
const personEntity: EntityType = {
  name: "person",
  search: async (query, ctx, opts) => {              // the EntityQuery
    let people = await db.searchPeople(query);
    if (opts?.constraint === "with-email-address") people = people.filter((p) => p.email);
    return people.map((p) => ({ id: p.id, label: p.name, hint: p.email, data: p }));
  },
  get: async (id, ctx) => hydrate(await db.person(id)), // resolve one by id for run()
};

const sendEmail: CommandNode = {
  id: "email.send",
  title: "Send email",
  args: [
    { id: "to", label: "to", kind: "entity", required: true,
      entity: { type: "person", constraint: "with-email-address" } }, // Person<'with-email-address'>
  ],
  run: async ({ to }) => sendTo(to),
};

createKernel({ roots: [sendEmail], entities: [personEntity] });
```

One registration now drives, for the `to` arg:

- **palette** completion — the chip suggests people from the catalog;
- **agent** — `kernel.entities.search("person", "jon", ctx)` resolves a NL
  reference to an id, and `describeNode` tells the agent the arg is a `person`
  (constraint `with-email-address`) so it knows to resolve against that catalog;
- **JSON Schema** — the param is described as "id of a person … resolve via the
  person catalog" (still `type: string`, MCP-flat);
- **run()** — `kernel.entities.get("person", id, ctx)` hydrates the full object.

The stored arg value is the entity's **id** (a string), so `ArgValues` stays flat
and the schema stays MCP-friendly. The `constraint` is opaque to the kernel — the
provider interprets it. Resolution order for an arg's options:
`enumValues → entity → complete`.

## Prior art — App Intents, mapped

App Intents has two pillars; ours map cleanly, with one twist:

| App Intents | Command Kernel | Note |
|---|---|---|
| `AppIntent` (an action) | `CommandNode` with `run` | — |
| `EntityQuery` (lists entities) | `CommandNode` with `resolve`, OR an `EntityType` | a node unifies both |
| `AppEntity` (a resolved object) | `Entity` (`{ id, label, data }`) | — |
| `@Parameter var p: PersonEntity` | `ArgSpec` with `entity: { type }` | the slot |
| `@Parameter(... ) where:` constraint | `EntityRef.constraint` | opaque tag |
| `parameterSummary` (NL for Siri) | `summary` + `toJsonSchema` description | — |

**The twist:** Apple keeps `AppIntent` (verb) and `EntityQuery` (noun-listing)
separate. Our `CommandNode` is a *superset* — one recursive type that can `run`
(verb), `resolve` (navigate/list, like an EntityQuery), or both (the Quicksilver
split). So a Command Kernel "node" is intent + navigation unified, and `Entity`
is the pure noun/object. That's why we keep the name `CommandNode` (it is more
than an "intent") and the unqualified `Entity` (the `@command-kernel` namespace
already says "command" — no need for `CommandEntity` stutter).

## Open fork — `listOf<X>` (multi-value entity args)

Jonas raised `listOf<X>` (Quicksilver's comma-multi-select). Today `ArgValues` is
`Record<string, string>` — single-valued. Supporting a list means either:

1. **Encode** a list as one string (comma/JSON-joined ids) behind a `multiple:
   true` flag — keeps `ArgValues` flat, costs a tiny encode/decode and a weaker
   JSON Schema (`type: string` with a "comma-separated" description).
2. **Widen** `ArgValues` to `Record<string, string | string[]>` — honest typing,
   a proper `{ type: "array", items: { type: "string" } }` schema, but it ripples
   through every surface that assumes string values (palette chips, deeplink
   query encoding, validation).

Recommendation: (2) is the right end state (arrays are first-class in JSON
Schema and what an LLM expects for a multi-select), but it's a real change to the
value model and deserves its own pass. (1) is a cheap stopgap if a single
command needs it sooner. Not built yet — flagged for a decision.

## Other backlog

- **Disambiguation** — when `search` returns several matches for an agent's NL
  reference, the kernel could return a "disambiguate" response (pick one) rather
  than the driver guessing. App Intents does this with `requestDisambiguation`.
- **Entity-existence validation** — optionally verify a supplied id resolves via
  `get()` before run (async; off by default to keep validation sync + cheap).
- **Property queries / constraints as structure** — `constraint` is a string
  today; a structured `where` filter is a natural richer form if needed.
