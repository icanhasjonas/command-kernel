# Driver #5 — the native DOM invoker (`<button command>`)

The browser shipped a declarative invoker. The HTML **Invoker Commands API**
(`command` / `commandfor` on `<button>`, [Baseline 2026][baseline]) lets markup
control another element with zero JavaScript:

```html
<button command="show-modal" commandfor="dialog">Open</button>
<dialog id="dialog">…</dialog>
```

Those are **built-in** commands — the browser does the work. The interesting
half for us is **custom** commands: any `command` value starting with `--` (like
a CSS custom property). The browser performs no built-in logic; it just dispatches
a [`CommandEvent`][commandevent] on the `commandfor` target, carrying
`event.command` (the string) and `event.source` (the button). That is almost
exactly the kernel's job — a typed, declarative "do this verb" event — handed to
us by the platform for free.

So we adopt it as **Driver #5**: HTML markup becomes a command surface, alongside
the palette (#1), the agent (#2), chords (#3), and deeplinks (#4). All five call
the one verb and the one gate.

## The binding

One delegated `command` listener on a single host routes every `--ck:` command
through the shared kernel:

```ts
import { bindInvokers, KERNEL_HOST_ID } from "@command-kernel/ui";

const host = document.getElementById(KERNEL_HOST_ID)!;
const off = bindInvokers(host, kernel, () => ctx, {
  onResult: (res) => toast(res.result.message),
  onGate: (res) => routeToApproval(res.node),   // gated — can't auto-fire
  onArgs: (res) => toast(`needs: ${res.missing.join(", ")}`),
  onUnresolved: () => toast("stale markup — unknown command id"),
  onError: (error) => toast(`run() threw: ${String(error)}`),
});
// …later
off();
```

Two handlers exist purely for honesty. `onUnresolved` fires when the decoded
path addresses no executable command — a typo'd or since-renamed id in markup
would otherwise fail *silently*, and markup rots. `onError` fires when the
command's `run()` throws; without it the error is re-thrown so it still
surfaces as an unhandled rejection instead of vanishing.

Every kernel `<button command>` points its `commandfor` at that one host. The
listener decodes the command, runs `kernel.command({ path, execute: true }, ctx)`,
and dispatches the response — the **same** `command()` + gate + evidence path the
palette and the agent use. The driver owns no permission logic; that stays in the
kernel, by covenant.

## The caveat — and how the keystone absorbs it

A `CommandEvent` carries **no arg payload**. Only the command string and the
source button. The kernel's whole thesis is "one arg schema drives every
surface," so the DOM invoker has to recover args from somewhere.

We solve it by **reusing the deeplink serializer** — the keystone in URL form.
The `command` value is just `--ck:` + a deeplink:

```
--ck:cmd/users.send_reset?user=jon@wall.north
└prefix┘└──────────── a deeplink (the keystone) ────────────┘
```

`commandAttr(path)` builds it; `parseInvoker(value)` strips the prefix and hands
the rest to `parseDeeplink`. Args ride **inside** the command string. No new
encoding, no per-surface schema — the same string the hash driver decodes, the
button driver decodes too. One schema, still.

## The security property (free)

The markup carries args but **never a grant** — the session salt never leaves the
kernel. A `<button>` into a gated command therefore cannot auto-fire: the listener
gets back a `gate` response and routes the human to approval, exactly like a gated
deeplink. The model / the markup / the URL can all *address* a gated command; none
of them can *approve* one. That falls out of the trust core, not the driver.

## `<a href>` vs `<button command>` — pick by intent

The same kernel node can render as either web primitive. Don't collapse them —
they mean different things, and `<KernelInvoker>` picks the right one from the
node's effect:

| | `<a href="#cmd/…">` | `<button command="--ck:…">` |
|---|---|---|
| Verb kind | **navigation** (read / pure) | **action** (writes / gated) |
| Maps to | the deeplink driver (#4) | this DOM invoker (#5) |
| Affordances | open-in-new-tab, copy link, crawlable | none — it's a button |
| No-JS | works (real navigation) | only built-ins work; custom needs the listener |
| `KernelInvoker` `as="auto"` | `effectMode(node) !== "writes"` | `effectMode(node) === "writes"` |

```tsx
import { KernelInvoker } from "@command-kernel/ui";

// auto: a pure/navigable node -> <a>, a writing/gated node -> <button command>
<KernelInvoker node={node} path={path}>{node.title}</KernelInvoker>

// override when you know better
<KernelInvoker node={node} path={path} as="button">Run it</KernelInvoker>
```

So **yes, you can render a "link" as a command-button** — but choose by intent:
links go places, buttons do things. Forcing a navigation into a `command` button
throws away the link affordances for nothing.

## Browser support & fallback

Invoker Commands reached [Baseline across all major browsers in 2026][baseline].
Built-in commands degrade to nothing without JS; **custom** commands need the
`bindInvokers` listener regardless (the browser only dispatches the event). For
older engines, the [OpenUI invokers polyfill][polyfill] backfills both. Because
every `--ck:` button mirrors a hash deeplink, an `<a href>` fallback for the same
verb is always one line away.

## TypeScript note

`@types/react` doesn't type `command` / `commandfor` on `<button>` yet, and the TS
DOM lib doesn't ship `CommandEvent`. The ui package augments the former in
`dom-command.ts` — a module the package entry imports for its side effect, so the
augmentation ships in `dist` and any consumer importing `@command-kernel/ui` can
write `<button command commandfor>` with no cast — and declares a local
`CommandEventLike` for the latter. Drop both when the upstream types land.

[baseline]: https://www.infoq.com/news/2026/01/html-invoker-commands/
[commandevent]: https://developer.mozilla.org/en-US/docs/Web/API/CommandEvent
[polyfill]: https://github.com/keithamus/invokers-polyfill
