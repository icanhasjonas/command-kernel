# Driver #3 — chords

`packages/core/src/keyboard.ts`. A layer stack and a chord state machine, ported
from remote-claude's `key-layers.ts` and stripped of React and of the terminal.
Core owns the state machine; the HOST owns the listener:

```ts
const kb = createKeyboard();
window.addEventListener("keydown", kb.handleKeydown, { capture: true });
```

Core never imports the DOM lib. Events arrive as `KernelKeyEvent`, which a real
browser `KeyboardEvent` satisfies structurally, and state is instance-scoped —
two kernels on one page get two independent stacks, never shared chord state.

## Typing beats commanding

The single most common way a shortcut system becomes unusable: somebody binds
`n` to "New task", and from then on nobody can type the letter n into a title
field. So a keystroke that is being TYPED is surrendered to the surface
receiving it, and the rule has exactly three parts:

```ts
if (editableTarget(e) && !hasModifier(normalized) && e.key.length === 1) return;
```

- **`editableTarget`** — `INPUT`, `TEXTAREA`, `SELECT`, or anything
  `isContentEditable`. The default sniffs `e.target` structurally; a host whose
  events are not DOM events replaces it with `createKeyboard({ isEditableTarget })`.
- **`!hasModifier`** — `mod`, `ctrl` and `alt` mean a command, so `⌘K` opens the
  palette from inside a text field, which is where you most want it. **Shift is
  excluded on purpose**: `shift+/` is a `?` character, and treating it as a
  modifier steals the key from every field on the page.
- **`e.key.length === 1`** — printable. `Escape`, `ArrowDown` and `Enter` are
  never typing, so a field can still be dismissed and navigated.

Placement matters and is deliberate. The guard sits AFTER the chord block, so a
prefix the user armed on purpose still resolves, and BEFORE arming, so a bare
prefix does not swallow the first letter of a word.

`e.target` is typed `unknown` rather than a structural `{ tagName?: string }`.
An all-optional shape is a **weak type** in TypeScript: a DOM `EventTarget`
shares none of its properties and would fail to assign, breaking the one line of
host wiring the interface exists to make possible.

## Suspend

```ts
kb.setSuspended(true);   // the whole stack goes quiet
```

Global rather than per-layer, because the caller that needs it most is a key
RECORDER capturing the chord a user is about to bind, and it cannot know which
layer owns the key it is about to swallow. A suspended keyboard does not cancel
events either — they pass through untouched. Suspending mid-chord clears the
armed prefix, so a prefix cannot survive the mute and eat an unrelated keystroke
on the way back.

## Two kinds of conflict check

They answer different questions and you usually want both.

| | Sees | Use it for |
| --- | --- | --- |
| `validateShortcuts(nodes)` | a STATIC node list | a build-time or boot-time audit of the registry |
| `kb.isBindingRegistered(pattern, excludeLayerId?)` | the LIVE layer stack | "is this key already taken?" while the app is running |

`validateShortcuts` cannot see a binding a driver added through `pushLayer`, so
it will happily report no conflicts while a modal quietly owns the key. Pass
`excludeLayerId` when a layer is rebinding its own key, or it reports itself.

Both normalize before comparing, so `mod+k`, `cmd+k` and (off a Mac) `ctrl+k`
are recognised as the one physical chord they are. `isBindingRegistered`
normalizes a chord pattern segment by segment, so `"g d"` matches `"g d"`.

## Layers

LIFO. `pushLayer(bindings, { base: true })` inserts below every non-base layer,
which is how app-wide shortcuts stay underneath a modal's. `{ enabled: false }`
skips a layer without unregistering it. `popLayer(layer)` removes it.
