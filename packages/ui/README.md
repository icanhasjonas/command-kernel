# @command-kernel/ui

Driver #1 for [`@command-kernel/core`](../core): a React command palette — fuzzy
search, drill-in navigation, named-arg pills, chords, and the gate confirm panel.
It owns NO permission logic; every execution flows through the kernel's gate,
exactly like the agent driver.

```bash
bun add @command-kernel/core @command-kernel/ui react react-dom
```

## Usage

Create ONE kernel and hand it to the palette (the same instance your other
drivers share — that sharing is the security invariant):

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

## Exports

`CommandPalette` (the driver), `Kbd` (a keycap), `cn` (clsx + tailwind-merge), and
`Icon` (a lucide wrapper). The palette logic lives in the `usePalette` hook if you
want to build a differently-styled shell over the same behaviour.

## Styling

Tailwind v4. The components use theme tokens (e.g. `pink`, `teal`, `glass`) the
consumer defines in their `@theme` — see `examples/playground/src/index.css` for
the demo's palette.

## Writing your own palette

`CommandPalette` is one renderer. To build your own, call `usePalette({ kernel,
ctx, roots, ... })` and render its returned state (`ranked`, `mode`, `confirm`,
`activate`, `confirmProceed`, ...), or drop to `kernel.command(...)` directly. See
the "write your own driver" guide in [`../core/README.md`](../core/README.md).

## License

MIT.
