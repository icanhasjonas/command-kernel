# 02 — `@command-kernel/ui`

Driver #1. Bundle cost, interaction, accessibility.

---

## U1 — the palette costs 717 kB minified · **P0**

`bun run report:bundle`, react/react-dom external:

```
import { CommandPalette } from "@command-kernel/ui"
  minified: 716.6 kB   gzipped: 193.7 kB

import { createKernel } from "@command-kernel/core"
  minified:   9.9 kB   gzipped:   4.1 kB
```

Measured contributions:

| Import | Minified |
|---|---|
| `import * as Lucide from "lucide-react"` | **537 kB** |
| `framer-motion` | 117 kB |
| everything else (radix dialog, clsx, tailwind-merge, core, the components) | ~63 kB |

The 537 kB is `icon.tsx`:

```ts
const registry = Lucide as unknown as Record<string, LucideIcon | undefined>;
export function Icon({ name, ...props }) {
  const Cmp = (name && registry[name]) || Lucide.Circle;
```

Resolving components from authored strings requires the whole module at runtime,
so every one of Lucide's ~1,500 icons ships. A palette that costs 194 kB gzipped
is not something a consumer adopts casually, and it undercuts the "small, honest,
readable" pitch on the front page.

**Fix, in order of preference:**

1. **Invert the dependency.** Take an icon map as a prop or a provider:
   `<CommandPalette icons={{ Search, Lock, ChevronRight, ... }}>`. The consumer
   imports the ~8 icons the palette actually uses plus whatever their nodes name,
   tree-shaken in their app. Lucide moves from `dependencies` to an optional
   peer. This also drops the `LucideIcon` type from the public surface, which is
   the right call for a driver that shouldn't dictate an icon library.
2. Ship a tiny default set (the ~8 the chrome needs, inlined as SVG) so the
   zero-config path stays trivial, and fall back to a neutral glyph for unknown
   names — the current `Circle` behaviour, minus the 537 kB.
3. Make `framer-motion` optional. The overlay/panel animations are a fade, a
   spring on the dialog, and a layout animation on the pills; the first two are
   CSS. If the springs are worth 117 kB, say so; if not, that is another 16% off.

A `report:bundle` budget in CI (see [03](03-packaging.md#p6)) stops this from
regressing again.

---

## U2 — demo copy is hardcoded in the published package · **P1**

| File | String |
|---|---|
| `CommandPalette.tsx:156` | `{f.node?.title ?? "Backoffice"}` — the root breadcrumb |
| `CommandPalette.tsx:237` | placeholder `"Search commands, users, forms, submissions…"` |
| `CommandLauncher.tsx` | `"Everything lives here now"` |

Every consumer of `@command-kernel/ui` gets the playground's app name in their
breadcrumb and its entity nouns in their search box. This is the one thing that
makes the package read as a demo with a kernel inside it rather than the reverse.

**Fix.** Props with sane defaults: `rootLabel` (default `"Commands"`),
`placeholder` (default `"Search commands…"`), `launcherHint` (default nothing).
While in there, gather them into a single `labels` prop so i18n is one object
rather than N props — the confirm panel, the footer hints, the empty state, and
`ArgOptions`' `"start typing to search…"` all have the same problem in smaller
doses.

---

## U3 — the palette is not accessible · **P1**

The results list is a `<div>` of `<button>`s. Missing, all of it:

- no `role="combobox"` / `aria-expanded` / `aria-controls` on the input
- no `role="listbox"` on the list, no `role="option"` / `aria-selected` on rows
- no `aria-activedescendant`, so a screen reader never announces the row that
  arrow keys moved to (focus stays in the input, which is correct — but then
  `aria-activedescendant` is how you say what's selected)
- no accessible name on the search input (no `aria-label`, no `<label>`)
- no `aria-live` region for "N results" / "no commands match"
- `ArgOptions` has the same gaps for the value list
- the free-text row and the arg pills have no programmatic relationship to the
  input they belong to

A command palette is the canonical case for the ARIA combobox pattern. Shipping
one without it is a straightforward exclusion, and for a package this small the
fix is maybe 30 lines.

**Fix.** Implement APG's combobox-with-listbox-popup pattern. Give each row a
stable `id` (`ck-opt-${node.id}`), point `aria-activedescendant` at the selected
one, add `role`/`aria-selected`, label the input, and add a visually-hidden
`aria-live="polite"` node carrying the result count. Add a test with
`getByRole("option")` so it can't silently rot.

---

## U4 — arrowing past the fold does not scroll · **P1**

The list is `max-h-[44vh] overflow-y-auto` (`CommandPalette.tsx:273`). `move()`
updates `selected` and wraps, and nothing ever scrolls. With more results than
fit — routine, the playground's user list alone overflows — arrow-key navigation
walks the selection off-screen and the wrap-around jump to index 0 leaves the
viewport at the bottom.

**Fix.** A ref on the active row and `scrollIntoView({ block: "nearest" })` in a
layout effect keyed on `selected`. `block: "nearest"` specifically — `"center"`
makes the list jitter on every keypress.

---

## U5 — the free-text option is mouse-only · **P1**

`ArgOptions` renders a "use *typed*" row when `freeText && typed.trim()`, but
that row is not in the `options` array. `move()` indexes `p.argOptions.length`,
so arrow keys can never reach it, and `onKeyDown` commits `p.argOptions[selected]`
whenever an option exists:

```ts
const opt = p.argOptions[p.selected];
if (opt) return p.commitArg(opt.value);
if (freeText && p.argQuery.trim()) return p.commitArg(p.argQuery.trim());
```

So the free-text branch is reachable only when the completion list is empty. Type
`jon` into a recipient field that suggests `jon@wall.north`, and there is no
keyboard path to commit the literal `jon`. The highlight logic
(`selected < 0 || options.length === 0`) hints the original design had a `-1`
index for this row; `move()`'s modulo wrap removed it.

**Fix.** Model the free-text row as index `-1` and let `move()` range over
`[-1, options.length)` when `freeText && typed.trim()`. Keeps one selection
model, restores the intended highlight condition, and Enter then means what the
highlight says.

---

## U6 — the confirm panel's copy is wrong for two of three check kinds · **P1**

`ConfirmPanel` renders every verdict check as `requires {c.label}`. Three kinds of
check flow through there now:

| Check source | Renders as |
|---|---|
| `gate.roles` | "requires role: admin" ✓ |
| `gate.reason` (informational, `ok: true`) | "requires sends a real email" ✗ |
| arg errors, and now missing-required (`executeNode`) | "requires Email must be a valid email" ✗ |

The second and third read as nonsense. The third is worse than cosmetic: an
invalid or missing arg is presented in the *permission* panel with a red shield,
so the user is told they lack authority when they actually mistyped. The palette
now routes missing args away from this panel (fix F2), but invalid values still
land here.

Also `key={c.label}` collides when two checks share a label.

**Fix.** Give `GateCheck` a `kind: "role" | "reason" | "arg"` and render per kind
("requires …", a plain informational line, and a field-error line respectively).
Key on index or an added `id`. Route `argErrors` to an arg-error UI rather than
the gate panel, the same way missing args now route to arg collection.

---

## U7 — one cancellation token, two async streams · **P2**

`usePalette` has a single `token = useRef(0)`. Both the dynamic search-resolve
effect and the arg-completion effect do `const mine = ++token.current` and
compare on resolve. They are unrelated streams, so an arg completion started
while a search resolve is in flight invalidates the search result (and vice
versa), and the palette silently keeps stale items.

**Fix.** One ref per stream — `resolveToken`, `argToken`. Two lines.

---

## U13 — `isMac` is decided at import and cannot be corrected · **P2**

`shortcut.ts:27` computes `isMac` once, at module evaluation, from
`navigator.platform` (deprecated) and `navigator.userAgent`. There is no
override.

Consequences: SSR renders `Ctrl` and hydrates into `⌘` (or the reverse); tests
get whatever the runner's globals say; an Electron or embedded host with an
unusual UA gets it wrong permanently. Every shortcut string, every `formatShortcut`
label, and the whole `normalizeEvent`/`normalizeShortcut` pair depend on it.

**Fix.** Keep the sniff as the default, add `setPlatform("mac" | "other" | "auto")`
or a `platform` option on `createKeyboard` that flows into normalization, and read
it lazily rather than at module load.

---

## U9 — debug chrome in a shipped component · **P2**

`ResultRow` renders `node.weight` as a number on the right of every row when it's
above 0. That's an authoring-time diagnostic, useful in the playground, noise in
a consumer's product.

**Fix.** `showWeight?: boolean` on `CommandPalette`, default `false`, threaded
down. The playground turns it on.

---

## U8 — frames go stale when `roots` changes while open · **P2**

The reset effect is deliberately keyed on `open` alone (with a biome-ignore
explaining it). Correct for the open-edge reset, but it means a role switch or a
registry change while the palette is open leaves the previous root list rendered.
The playground makes this reachable: the role toggle is in the header, and `⌘K`
can be open at the same time.

**Fix.** Keep the open-edge reset, and separately sync `frames[0].items` when
`roots` changes and the stack is at depth 1.

---

## U10 — one `<span>` per character · **P2**

`Highlight` wraps every character in its own element, matched or not. A 40-char
title in a 12-row list is ~480 DOM nodes for what is usually 2-3 highlighted
runs.

**Fix.** Group consecutive matched/unmatched runs into segments. Same output,
roughly a tenth of the nodes, and the array-index keys stop being a smell.

---

## U11 — always-on window listeners for a cosmetic glow · **P2**

`CommandPalette` attaches `keydown` + `keyup` listeners on mount, regardless of
`open`, purely to track whether Meta/Control is held for the chord-hint glow.
Gate them on `open`.

---

## U12 — two files over the repo's own limits · **P2**

`CLAUDE.md` says files over 200 lines are a smell and React components over 150
are a hard no. `CommandPalette.tsx` is 318 and `usePalette.ts` is 357.

The natural cuts: the arg-pill row (`ArgPills`), the footer hint bar
(`PaletteFooter`), and in the hook, the arg session (`useArgSession`) and the
confirm session (`useConfirmSession`) are each self-contained state machines that
happen to share a file.
