# Driver #3 - the keyboard

`packages/core/src/keyboard.ts`. One stack of layers and a chord state machine,
ported from remote-claude's `key-layers.ts` and stripped of React and of the
terminal. Core owns the state machine; the HOST owns the listener, and hears
keys in the bubble phase (law L15 below):

```ts
const kb = createKeyboard();
window.addEventListener("keydown", kb.handleKeydown); // or attachKeyboard(kb, window)
```

Core never imports the DOM lib. Events arrive as `KernelKeyEvent`, which a real
browser `KeyboardEvent` satisfies structurally, and state is instance-scoped:
two kernels on one page get two independent stacks, never shared chord state.
A React host uses `@command-kernel/react`, which attaches that listener and
pushes and pops layers with the component tree (see "In React").

## Typing beats commanding

The single most common way a shortcut system becomes unusable: somebody binds
`n` to "New task", and from then on nobody can type the letter n into a title
field. So a keystroke that is being TYPED is surrendered to the surface
receiving it, and the rule has exactly three parts:

```ts
if (editableTarget(e) && !hasModifier(normalized) && e.key.length === 1) return;
```

- **`editableTarget`** - `INPUT`, `TEXTAREA`, `SELECT`, anything
  `isContentEditable`, and any widget role that owns its own typeahead
  (`listbox`, `menu`, `option`, `combobox`...). The default sniffs `e.target`
  structurally; a host whose events are not DOM events replaces it with
  `createKeyboard({ isEditableTarget })`.
- **`!hasModifier`** - `mod`, `ctrl` and `alt` mean a command, so `⌘K` opens the
  palette from inside a text field, which is where you most want it. **Shift is
  excluded on purpose**: `shift+/` is a `?` character, and treating it as a
  modifier steals the key from every field on the page.
- **`e.key.length === 1`** - printable. `Escape`, `ArrowDown` and `Enter` are
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
events either: they pass through untouched. Suspending mid-chord clears the
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

One app, one keyboard, one stack. Every key goes through it: the app's own
shortcuts, the context of the screen you are on, and every dialog, menu, sheet
and suggestion list that is open. Nothing else decides who gets a key - not the
order components mounted in, not DOM bubbling, not a `stopPropagation` in some
widget.

The ORDER of that stack is the whole contract, so it is written down as laws.
Each law is a `describe` block with the same number in
`packages/core/src/keyboard-layers.test.ts` (L15 lives in
`packages/react/src/keyboard-react.test.tsx`), and `test/docs-keyboard.test.ts`
fails the build when a law here has no test or a tested law is missing here.

A mail app with a New mail editor open, its recipient suggestions showing:

```
top      suggestions   parent: editor          ArrowDown  ArrowUp  Enter  Escape
         editor        modal, passes mod+k     Escape (discard)  mod+Enter (send)
         -------------- barrier: only mod+k goes further down --------------
         scope:thread  base, live by facts     r  Escape (back)
         scope:list    base, live by facts     j  k
bottom   scope:global  base, live by facts     mod+k  ?
```

Escape closes the suggestions, not the editor. A second Escape discards the
draft, and never also goes "back" in the thread behind it. `j` does nothing
while the editor is open. `mod+k` still opens the palette.

### The laws

- **L1** The top live layer takes a key. Popping a layer hands its keys back to
  the layer below.
- **L2** Base layers (`base: true`) sit below every other layer, whenever they
  were pushed. The app's own keys and every facts scope are base.
- **L3** A layer pushed with `parent: "<id>"` sits above that layer and beside
  its other children, whatever order the two were pushed in. React runs a
  child's effects before its parent's, so plain push order would put a popover
  UNDER its own dialog; the stack re-sorts by ownership on every change instead.
  Siblings stack in push order. Default ids (`layer-N`) never repeat, so a
  parent id always names one layer.
- **L4** A handler that returns exactly `false` declines: the key goes on down,
  as if that binding were not there.
- **L5** A live `modal: true` layer is a barrier. A key it does not take
  (unbound, or declined) stops there: nothing below runs, and the event is not
  cancelled, so the browser still has it. A dialog, a menu, a sheet.
- **L6** `passThrough: ["mod+k"]` lets the keys it names cross a barrier, in any
  spelling (`Mod+K`, `cmd+k` on a Mac).
- **L7** A key the focused widget already handled (`defaultPrevented`) is never
  offered to the stack. This is how a third-party widget keeps its own arrows,
  typeahead and Escape, and why L15 insists on the bubble phase.
- **L8** Typing beats commanding (above), on every layer, modal or not.
- **L9** A key pressed while an input method is composing (`isComposing`, or
  Safari's `keyCode` 229 on the Enter that ends a composition) is never a
  command: that Enter picks a candidate, that Escape cancels it.
- **L10** A layer's keys are canonical: `mod+enter`, `Mod+Enter` and `G I` bind
  the presses `mod+Enter` and `g` then `i`, whatever the spelling.
- **L11** Chords obey barriers: a prefix bound only below a modal layer neither
  arms nor completes, and `chordCompletions` does not offer it.
- **L12** Facts scopes (`bindScopes`) are base layers, so rebinding them (the
  node list changed while a dialog was open) never lands above an open overlay.
- **L13** A mounted scope puts the commands declared in it on the stack while
  something is open: `bindScopes({ ..., mounted: ["editor"] })`, then
  `binding.mount("editor", { modal: true, parent })`, popped with
  `kb.popLayer(layer)`. Its commands run, decline and give a disabled reason
  exactly like a facts scope's. A scope not declared as mounted cannot be
  mounted; `dispose()` pops mounted layers too.
- **L14** `kb.describeStack()` reports what a press would reach: the layers top
  first, and each reachable key with its layer and node. Draw key hints and a
  help sheet from it, and they can never offer a key that something above
  would take first.
- **L15** A browser host listens ONCE, in the bubble phase:
  `attachKeyboard(kb, window)` from `@command-kernel/react` (what
  `KeyboardProvider` does). A capture listener runs before every widget and
  breaks L7.
- **L16** `kb.subscribeStack(fn)` is told after every push and every pop.

### Facts scope or mounted scope?

Both come from `bindScopes`, and in both the KEYS stay on the command nodes
(`shortcut`, `scope`). A layer only says which commands are live, and where on
the stack; it never defines a key of its own, so a hint, the palette and a help
sheet all read the same keys.

| | Live while | Examples |
| --- | --- | --- |
| facts scope (`scopes`) | `activeScopes(ctx)` names it: something is TRUE | the screen you are on, where focus is |
| mounted scope (`mounted`) | a component has it mounted: something is OPEN | a dialog, a sheet, a menu, a suggestion list, the palette |

Use a facts scope for context and a mounted scope for anything that opens and
closes. An `activeScopes` that inspects the DOM for "is a dialog open?" is a
mounted scope in the wrong place.

### In React

`@command-kernel/react` binds the stack to the component tree. Its only
dependencies are core and React.

```tsx
const kb = createKeyboard();
const scopes = kb.bindScopes({
  nodes,
  scopes: ["global", "list", "thread"],
  mounted: ["editor", "suggestions"],
  ctx,
  activeScopes,
  onActivate,
  onDisabled,
});

<KeyboardProvider keyboard={kb} scopes={scopes}>  {/* the one listener (L15) */}
  <App />
</KeyboardProvider>;

function NewMail() {
  return (
    <Dialog>
      <KeyboardScope scope="editor" modal passThrough={["mod+k"]}>
        <RecipientField /> {/* renders <KeyboardScope scope="suggestions" /> while listing */}
      </KeyboardScope>
    </Dialog>
  );
}
```

- `KeyboardScope` / `useKeyboardScope(scope, options)` mount a scope for as long
  as the component is mounted.
- `KeyboardLayer` / `useKeyboardLayer(bindings, options)` push plain bindings,
  for keys that are not commands. A handler can change on every render without
  a re-push; only a change to the set of keys re-pushes.
- The `parent` of every layer is the nearest layer around it in the React tree,
  through portals too: a popover rendered into `document.body` from inside a
  dialog is still the dialog's child (L3). Nobody passes an id by hand.
- `useKeyboardStack()` is `describeStack()` that re-renders on push and pop, for
  hints and a help sheet.
- `useKeyboard()` is the keyboard itself (chord mode, suspend).

### Recipes

**A dialog, menu or popover from a headless library.** Wrap its content in a
`KeyboardScope` (or `KeyboardLayer`) with `modal`, and let that layer own
Escape. Then stop the library from also acting on Escape, or one press closes
two things. With Base UI, cancel the `escape-key` reason in `onOpenChange` (read
from Base UI 1.8's source: `useDismiss` calls `preventDefault` on the Escape
only when the change was NOT cancelled):

```tsx
<Dialog.Root
  open={open}
  onOpenChange={(next, details) => {
    if (!next && details.reason === "escape-key") return details.cancel();
    setOpen(next);
  }}
>
```

Base UI's dismiss hook then leaves the key unprevented, so it reaches the
dialog's layer, which runs your close or discard command, and that command can
ask first ("Discard this draft?").

**A widget of your own with keys** (a suggestion list, a tag picker). Declare
its keys as commands in a mounted scope and mount it while the widget is open.
Not an `onKeyDown` with `stopPropagation`: that key would be invisible to the
stack, to hints and to the help sheet, and it only wins by DOM order.

**The palette over a dialog.** The palette is a modal layer of its own. It is
pushed after the dialog's, so it sits on top; closing it hands the keys back to
the dialog (L1).

**Hints that never lie.** Draw a button's key hint from the command node, and
show it only when `describeStack().reachable` has that key for that node.
