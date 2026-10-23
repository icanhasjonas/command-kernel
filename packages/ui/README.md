# @command-kernel/ui

Driver #1 for [`@command-kernel/core`](../core): a React command palette - fuzzy
search, drill-in navigation, named-arg pills, chords, and the gate confirm panel.
Plus driver #5: the native DOM invoker, `<button command="--ck:…">` markup routed
through the same kernel. It owns NO permission logic; every execution flows
through the kernel's gate, exactly like the agent driver.

```bash
bun add @command-kernel/core @command-kernel/ui react react-dom
```

## Usage

Create ONE kernel and hand it to the palette (the same instance your other
drivers share - that sharing is the security invariant):

```tsx
import { createKernel } from "@command-kernel/core";
import { CommandPalette } from "@command-kernel/ui";

const kernel = createKernel({ roots });

<CommandPalette
  open={open}
  kernel={kernel}
  ctx={ctx}
  roots={kernel.roots(ctx)}
  trigger={chordTrigger}        // { id, nonce } to jump straight into a command
  onClose={() => setOpen(false)}
  onResult={(r) => toast(r.message)}
  onExecuted={(id) => bumpFrecency(id)}
/>
```

- **⌘K** opens it; type to fuzzy-match. **Enter** drills a category; **⌘Enter**
  runs a search as a results page (the Quicksilver split).
- A gated command surfaces the **confirm panel**; on Allow the palette mints a
  grant via `kernel.evidence` and re-issues the identical call. Flip the ctx role
  to `viewer` and gated commands lock.

### Icons: register the ones your commands name

Commands carry icons as data (`icon: "Mail"`). The palette draws only icons you
register, so your bundle holds the icons you use, not all of lucide (that was
~190 kB gzipped). Register once, at startup:

```ts
import { registerIcons } from "@command-kernel/ui";
import { Mail, Users } from "lucide-react";

registerIcons({ Mail, Users });
```

A name nobody registered draws a plain circle. `iconFor(name)` answers `undefined`
for it, so a test can check that every name your command tree uses is registered.

## Copy is yours (`labels`)

The package names no app, no nouns, and no language. Defaults are neutral
English; override any subset and the rest stays put:

```tsx
<CommandPalette
  labels={{
    root: "Acme",                              // the root breadcrumb
    placeholder: "Search Acme…",
    searchLabel: "Search Acme",                // the input's accessible name
    noMatch: (q) => `nichts gefunden für „${q}“`,
    argCounter: (filled, total) => `${filled}/${total}`,
    confirmRun: "Bestätigen",
  }}
  ...
/>
```

Every string the palette can render lives in one `PaletteLabels` object
(`labels.tsx`) - the browse frame, the arg pills, the gate panel, and the footer
hints. Entries that interpolate a value are **functions**, so a translator
controls word order instead of gluing fragments; `freeTextOption` and `chordHint`
return a `ReactNode`, so overriding them gives you the markup too.

`defaultLabels` and `resolveLabels` are exported if you want to build on the
defaults rather than replace them.

Two other presentation props:

| Prop | Default | What |
|---|---|---|
| `showWeight` | `false` | render each node's authoring `weight` in its row - an authoring diagnostic, off in product |
| `CommandLauncher`'s `label` / `hint` | `"Open the command palette"` / `""` | the trigger button's accessible name and its hover copy |

## The DOM invoker (driver #5)

Plain HTML is a command surface too. A `command` attribute whose value is
`--ck:` + a deeplink fires through the identical kernel + gate:

```tsx
import { bindInvokers, KERNEL_HOST_ID, KernelInvoker } from "@command-kernel/ui";

// once, on the shared host element every <button commandfor> points at:
const off = bindInvokers(host, kernel, () => ctx, {
  onResult: (res) => toast(res.result.message),
  onGate: (res) => routeToApproval(res.node), // gated markup can't auto-fire
});

// or let the component pick the right primitive from the node's effect:
<KernelInvoker node={node} path={path}>{node.title}</KernelInvoker>
// pure/navigable -> <a href="#cmd/...">, writes/gated -> <button command>
```

Importing this package also augments React's `ButtonHTMLAttributes` with
`command` / `commandfor`, so the markup typechecks without casts.

## What a host plugs in

Four props and a hook for an app that brings more than commands. None is required.

```ts
interface CommandPaletteProps {
  // ...open, kernel, ctx, roots, trigger, subjects, labels, showWeight, onClose, onResult, onExecuted
  sources?: readonly PaletteSource[];
  rowAdornment?: (node: CommandNode, state: { active: boolean }) => ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}

interface PaletteSource {
  id: string;                 // stable: searches are keyed by it
  group?: string;             // the heading its rows sit under (a row's own category wins)
  minQuery?: number;          // the shortest query that runs it, default 2
  search(query: string, ctx: Ctx, signal: AbortSignal):
    readonly CommandNode[] | Promise<readonly CommandNode[]>;
}

function useFrecency(options?: { storageKey?: string; storage?: FrecencyStorage }):
  { frecency: Record<string, number>; bump: (id: string) => void };
```

- **`sources`: your own search at the root.** Threads by their text, orders by number.
  Each hit is a `CommandNode`, so it behaves like any row: `run` runs it (through the
  kernel's gate, like everything), `resolve` drills into it, `subject` puts it in hand
  for a pipe. The rows land after the commands, in your order, and never move a row
  already on screen, so Enter never waits for them. `signal` aborts when the query moves
  on; a slow answer for an old query is dropped either way; a throw is no rows. Sources
  run only at the root while browsing, never inside a drill or an arg.

  ```tsx
  const threads: PaletteSource = {
    id: "threads",
    group: "Threads",
    search: async (q, _ctx, signal) =>
      (await api.searchThreads(q, { signal })).map((t) => ({
        id: `thread:${t.id}`,
        title: t.subject,
        subtitle: t.from,
        icon: "Mail",
        run: async () => (openThread(t.id), { kind: "navigate", message: t.subject }),
      })),
  };
  <CommandPalette sources={[threads]} ... />
  ```

- **Disabled rows say why.** A node's own `disabled(ctx)` (core) is read on every row: the
  row stays listed, greyed, with the reason at its end (`aria-disabled`), and picking it
  shows the reason at once (said too, `role="alert"`), as it is, with no role against it,
  before any arg is asked for. Nothing to pass: put the reason
  on the node, and the app's state in `ctx.facts`.
- **`rowAdornment`: anything of yours at a row's end** (an unread count, a state), drawn
  before the keycaps. `active` is true for the highlighted row.
- **`useFrecency`: what you run rises.** `frecency` goes into `ctx.frecency` (the kernel's
  ranker reads it), `bump` into `onExecuted`. With a `storageKey` it is kept in
  `localStorage` (or your own `storage`) across reloads; anything in it that is not a
  number is ignored.

  ```tsx
  const { frecency, bump } = useFrecency({ storageKey: "acme.palette" });
  const ctx = useMemo(() => ({ ...base, frecency }), [base, frecency]);
  <CommandPalette ctx={ctx} onExecuted={bump} ... />
  ```

- **Focus goes back where it was.** The palette remembers the element that had focus when
  it opened, and gives focus back to it once it has closed (after its exit). To put focus
  somewhere else, handle `onCloseAutoFocus` and call `event.preventDefault()`.

### For a host with its own layout and its own search

```ts
interface CommandPaletteProps {
  // ...
  arrange?: (input: { commands; found; query; ctx }) => readonly Ranked[];
  initialQuery?: string;
  onKeyDown?: (event, state: { query; mode }) => boolean | undefined;
  footer?: ReactNode;
  onRun?: (node: CommandNode) => void;
  onError?: (error: unknown, node: CommandNode) => void;
}
```

- **`arrange`: the host lays out the root.** It gets the kernel's ranking of the commands and
  the sources' rows apart, and returns every row in the order drawn: its screen's group first,
  a "Recent" group (a row whose `category` it set; one node may sit under two headings), what
  cannot run last. Rows under one heading sit together. Only at the root, browsing.
- **A source keeps answering.** `search(query, ctx, signal, update)` may answer with rows or
  with `{ rows, note, keepOpen }`, and call `update` with a new answer as often as it has
  news, until `signal` aborts: a "Searching…" note first, the hits once they come, the next
  page. The note is drawn under the list (with no rows, in place of the empty state). A row
  whose id is in `keepOpen` ("Search further back", "Try again") runs without closing the
  palette.
- **The palette gets out of a command's way.** Once a command's args, gate and confirm have
  all passed, the palette closes as the run starts (`onRun(node)`, then `onClose()`), never
  after a slow run has finished. A command that hands a value on keeps it open, as before.
  (Core: `kernel.executeNode(node, args, ctx, confirmation, { beforeRun })`.) A run that
  throws closes it and goes to `onError`.
- **`onKeyDown`** sees every key before the palette does; answer `true` to keep one (a help
  key, a key the host reserves). **`footer`** puts the host's controls at the footer's end,
  on touch screens too (a function of `{ query, mode }` draws them for what is on screen). **`initialQuery`** opens the palette on words already typed.
- **Words:** `labels.context(where, role)` is the header's right end ("" leaves it out, for
  an app with one role); `labels.title` and `labels.description` name the dialog; `labels.resultCount`
  is said to a screen reader as the rows for a typed query settle. The search box is a
  combobox whenever it is browsing, expanded while it shows rows.
- **`useFrecency({ counts })`** counts only the runs `counts(id)` allows (leave out a thread
  opened from a search: its count would only grow).

## Exports

`CommandPalette` + `CommandLauncher` (the palette driver), `bindInvokers` /
`KernelInvoker` / `commandAttr` / `parseInvoker` (the DOM-invoker driver),
`Kbd` (a keycap), `cn` (clsx + tailwind-merge), `Icon` / `registerIcons` /
`iconFor` (icons by registered name), `useFrecency`, `motionTokens` (Arc's motion
presets), and the types `CommandPaletteProps`, `PaletteSource`, `PaletteState`.
The palette logic lives in the `usePalette` hook if you want to build a
differently-styled shell over the same behaviour.

## Styling: Arc

The palette is drawn in the design language of [Arc](https://uiarc.dev): a neutral
surface with a hairline border and one floating shadow, one-line rows with one
highlight that glides between them, results grouped under their category, flat
keycaps, pill-shaped args, weights 400 and 500 only. It moves with Arc's motion
(`motion`, the library once called framer-motion): the panel rises in on a damped
spring and leaves faster than it came, the body's height follows what is in it, and
every animation has a reduced-motion branch that jumps to the end state.

It reads **Arc's own CSS variables** (`--surface`, `--surface-muted`, `--foreground`,
`--text-secondary`, `--text-muted`, `--border`, `--border-subtle`, `--border-strong`,
`--accent`, `--accent-strong`, `--accent-subtle`, `--accent-foreground`, `--success`,
`--warning`, `--danger`, `--radius-panel`, `--radius-control`, `--shadow-floating`,
`--ease-standard`). An app that loads Arc's `foundation.css` gets the palette in its
theme and accent, light or dark, with nothing to configure.

An app without Arc gets Arc's neutral values as fallbacks, through `light-dark()`: set
`color-scheme: dark` on a dark page and the palette is dark too. Import the sheet once
(it also points Tailwind v4 at the palette's sources):

```css
@import "tailwindcss";
@import "@command-kernel/ui/theme.css";
```

To change one thing, override its `--color-ck-*` (or `--radius-ck-*`, `--shadow-ck-*`)
in your own `@theme`, e.g. `@theme { --color-ck-accent: #6366f1; }`. The accent is
spent only on what is active: the arg being filled, the value in hand, the primary
button, a held key. A fuzzy match is underlined; `.match-hl` is the hook to mark it your
own way. See `examples/playground/src/index.css` for a host without Arc.

## Writing your own palette

`CommandPalette` is one renderer. To build your own, call `usePalette({ kernel,
ctx, roots, ... })` and render its returned state (`ranked`, `mode`, `confirm`,
`activate`, `confirmProceed`, ...), or drop to `kernel.command(...)` directly. See
the "write your own driver" guide in [`../core/README.md`](../core/README.md).

## License

MIT.
