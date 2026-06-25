# Ergonomics & surface review

> After the DEEPEN pass (entities, disambiguation, `listOf<X>`, the projection,
> deeplinks-as-drivers), the honest question: did the surface bloat, and does an
> author now pay for power they don't use? Verdict up front: **no** — every new
> capability is an opt-in field or fully derived, with **one** real tax (the
> multi-value type), centralized so it doesn't leak.

## The test that matters: authoring ONE command

The guardrail is "a `CommandNode` stays a plain literal." It holds — a trivial
command is byte-for-byte what it always was:

```ts
{ id: "theme.toggle", title: "Toggle theme", run: async () => ({ kind: "toast", message: "ok" }) }
```

Everything below is **additive sugar**. You reach for a field only when you want
the behavior; you never pay for the ones you don't.

## Before / after, per capability

| Capability | Before | After | Author cost |
|---|---|---|---|
| Entity-typed arg | a hand-rolled `complete` closure on **every** arg, duplicated across commands | `entity: { type: "person" }` — one registered catalog, reused | **less** code per command |
| Constraint | filter inside each closure | `entity: { type, constraint: "with-email-address" }` | one field |
| Multi-select | impossible (string-only) or encode-by-hand | `multiple: true` | one field |
| Disambiguation | the driver guesses, or you hand-code "which one?" | automatic in `command()` | **zero** |
| Deeplink | bespoke route parser | derived from the arg schema | **zero** |
| Agent tools | hand-written tool defs | derived (`toJsonSchema` / projection) | **zero** |
| Button / `<a href>` → command | a bespoke onClick handler | bind to a deeplink; one bridge runs `command()` | **zero** per element |

The arrow points the right way: the deeper the feature, the *less* per-command
ceremony, because the schema is doing the work.

## What the surface actually grew by (this pass)

Net new public exports across entities + disambiguation + `listOf`:

- types: `ArgSpec.multiple`, `ArgValue`, `EntityRef`
- one response kind: `disambiguate`
- three value helpers: `argList`, `isFilled`, `argText`
- the entity seam: `EntityType` / `EntityRegistry` / `createEntityRegistry` / `Entity` / `entityOption`

That's a handful of names for three real capabilities. No new config DSL, no
per-surface duplication, no new required field on `CommandNode`. The seam count
went 5 → 6 (entities); everything else hangs off the existing `ArgSpec`.

## The one real tax (named, not hidden)

`ArgValues` widened from `Record<string, string>` to
`Record<string, string | string[]>`. That is a genuine cost: anything that reads
an arg value must now handle both shapes. We paid it **once**, centrally:

```ts
import { argList, isFilled, argText } from "@command-kernel/core";
argList(v)   // -> string[]   (single -> [single])
isFilled(v)  // -> boolean    (non-blank present?)
argText(v)   // -> "a, b"     (display)
```

Every kernel reader (`missingArgs`, `validateArgs`, evidence serialization,
policy matching, the palette) goes through these three functions — none branches
on `Array.isArray` inline. A `run()` body that only ever takes single values can
still template `${a.to}` (a list coerces to `"a, b"`); a multi-value `run` calls
`argList(a.to)`. If we'd kept values string-only and comma-encoded lists, authors
would be parsing strings by hand — strictly worse. The union is the honest price
of first-class multi-value, and it's quarantined.

## Surface coherence check

- **One verb still** — `command()` absorbed disambiguation + entity resolution
  without a new entry point. Drivers didn't change shape.
- **One schema still** — `multiple` and `entity` are fields on the same
  `ArgSpec` that drives chips, params, deeplinks, validation. No second schema.
- **Trust core untouched** — gate/evidence/policy didn't grow; a list just
  serializes as a sorted set for grant binding.
- **Drivers unchanged** — the palette gained multi-select UX; its contract
  (`usePalette` / `CommandPalette` props) is the same.

## Verdict

Deepening **sharpened** the thesis rather than bloating it: more is now derived
from the one schema, not bolted on per surface. The over-abstraction trap (the
research doc's §3.2) was avoided — authoring stayed trivial. The single tax (the
value union) is real, named, and contained. Ship it.
