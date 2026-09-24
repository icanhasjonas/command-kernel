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
and suggestion list that is open. Which of them gets a key is decided by the
stack, never by the order components mounted in or by DOM bubbling. (The one
thing the stack cannot see is a key a widget swallowed with `stopPropagation`
before it bubbled to the listener: that is why a widget of your own declares
its keys as a layer instead, see Recipes.)

The ORDER of that stack is the whole contract, so it is written down as laws.
Each law is a `describe` block with the same number in
`packages/core/src/keyboard-laws-{order,keys,scopes}.test.ts` (L15 lives in
`packages/react/src/keyboard-react.test.tsx`), and `test/docs-keyboard.test.ts`
fails the build when a law here has no test block, a block has no assertion,
or a tested law is missing here.

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

- **L1** The nearest live layer that knows a key takes it: as a binding it
  runs, as the start of a chord it arms the chord. A single key above beats a
  chord below on the same key, a chord above beats a single key below, and in
  ONE layer a chord beats a single key. The same rule decides every step of a
  longer chord (`g i` against `g i x`). A key a layer declines (L4) goes on to
  the next layer that knows it, which may arm a chord. A chord whose every
  command is hidden (`when`) is not there: it does not arm, and the key goes on
  (a disabled one still arms, so its second key can say why). Popping a layer hands its
  keys back to the layers below. While a chord is armed, a key that completes
  no chord (unbound after the prefix, or declined) cancels it and then runs as
  itself, exactly as if no chord had been armed: `g` then `c` runs `c`, `g`
  then `mod+k` opens the palette, `g` then `h` arms `h` if `h` starts a chord,
  and a letter typed into a field is left to the field (L8). Escape is the one
  exception: it only cancels the pending chord, and never also runs an Escape
  binding (so it does not close the dialog behind the chord).
- **L2** Base layers (`base: true`) sit below every other layer, whenever they
  were pushed. Every facts scope is base, and `registerShortcuts`' flat map sits
  lower still, under the scopes.
- **L3** MODAL LAYERS ARE WINDOWS. Every layer belongs to its nearest modal
  owner-or-self, or to the screen (below every window). The window opened last
  is on top, and a layer never rises above a window that is not its own:
  suggestions that open late in the editor stay under a palette opened in the
  meantime, and a toast shown while a dialog is open stays under it (its keys
  do not cross the barrier). Inside a window, the layer opened last is on top,
  and a layer is always above its owner, whatever order the two were pushed in
  (React runs a child's effects before its parent's, so plain push order would
  put a popover UNDER its own dialog). A modal editor opened inside an older
  screen is a new window, above everything on that screen. The stack re-sorts
  on every change. Ownership beats base: a base layer owned by a dialog sits
  above the dialog. A layer whose owner is popped keeps the place and tier it
  had. Two live layers cannot share an id (the second push throws), so a parent
  id always names one layer; default ids, facts-scope ids and mount ids never
  repeat and never take the id of a layer that is up.
- **L4** A handler that returns exactly `false` declines: the key goes on down,
  as if that binding were not there. Which layers the press visits is fixed
  when the key goes down, and a layer a handler pops during the press does not
  run; each layer's `modal`, `enabled` and `active` are read as the press
  reaches it.
- **L5** A live `modal: true` layer is a barrier. A key it does not take
  (unbound, or declined) stops there: nothing below runs, and the event is not
  cancelled, so the browser still has it. A dialog, a menu, a sheet. A layer
  switched off (`enabled: false`) is no barrier and takes no key, and neither
  does anything it owns: closing a dialog closes its suggestion list's keys too.
- **L6** `passThrough: ["mod+k"]` lets the keys it names cross a barrier, in any
  spelling (`Mod+K`, `cmd+k`), checked when the layer is pushed. A chord
  crosses only when the WHOLE sequence is named: `"g i"`, not `"g"`.
- **L7** A key the focused widget already handled (`defaultPrevented`) is never
  offered to the stack, and it ends a pending chord. This is how a third-party
  widget keeps its own arrows, typeahead and Escape, and why L15 insists on the
  bubble phase.
- **L8** Typing beats commanding (above), on every layer, modal or not.
- **L9** A key pressed while an input method is composing (`isComposing`, or
  Safari's `keyCode` 229 on the Enter that ends a composition) is never a
  command: that Enter picks a candidate, that Escape cancels it. It ends a
  pending chord too.
- **L10** A layer's keys are canonical: `mod+enter`, `Mod+Enter` and `G I` bind
  the presses `mod+Enter` and `g` then `i`. Named keys in the alias table match
  in any case (`esc`, `ENTER`, `insert`, `printscreen`); any other named key is
  matched as written, so spell it as `KeyboardEvent.key` does
  (`MediaPlayPause`), and a lower-case name the table does not know throws
  instead of binding a key that never fires. A literal `" "` is Space. Two
  spellings of one key (`Escape` and `esc`) in one layer, or in one
  `registerShortcuts` map, throw instead of one silently winning. `shift+` in
  front of a symbol means the symbol itself (`shift++` is `+`): write the
  character the press makes, `?`, never `shift+/`. Any single character binds,
  an emoji included. `validateShortcuts` reports a shortcut that cannot bind
  (its `problem`) instead of throwing.
- **L11** Chords obey barriers: a prefix bound only below a modal layer neither
  arms nor completes, and `chordCompletions` does not offer it.
- **L12** Facts scopes (`bindScopes`) are base layers, so they never land above
  an open overlay. When the commands change, `binding.setNodes(nodes)` swaps them
  on every layer the binding has up, mounted ones included, as ONE change, and
  nothing moves. A second binding of the same scopes is allowed (each gets its
  own layer ids). Binding and `setNodes` are all or nothing: a node that cannot
  bind throws before anything is pushed or changed.
- **L13** A mounted scope puts the commands declared in it on the stack while
  something is open: `bindScopes({ ..., mounted: ["editor"] })`, then
  `binding.mount("editor", { modal: true, parent })`, popped with
  `kb.popLayer(layer)`. Its commands run, decline and give a disabled reason
  exactly like a facts scope's. A scope not declared as mounted cannot be
  mounted; `dispose()` pops mounted layers too, and a disposed binding mounts
  nothing (it throws). `kb.createScopes(options)` makes the same binding
  without touching the stack: `attach()` pushes its facts scopes, `detach()`
  takes them off, and `mount` works either way (`bindScopes` is create +
  attach).
- **L14** `kb.describeStack()` reports what a press would reach: the layers top
  first, and each reachable key with its layer and node, decided step by step by
  the same walk a press makes (barriers, L1 at every step of a chord). A
  command that would decline (`when` hides it, `disabled` stops it) is foreseen:
  its key is not reachable there, and whatever the press would reach instead
  is. A plain `pushLayer` handler is opaque, so it is assumed to run. The facts
  are read fresh, once per description, including a description made inside a
  handler. A suspended stack reaches nothing. `chordCompletions(prefix)` is the
  same description, one step past the prefix (in any spelling). A description
  has no focus: a single-letter key it lists will not fire while the user types
  in a field (L8). Within that, hints drawn from it never offer a key a press
  would not reach; show a disabled command's key from its node, with the reason.
- **L15** A browser host listens ONCE, in the bubble phase:
  `attachKeyboard(kb, window)` from `@command-kernel/react` (what
  `KeyboardProvider` does). A capture listener runs before every widget and
  breaks L7.
- **L16** `kb.subscribeStack(fn)` is told after every push, pop and update,
  with the layer already in its final place, and when the stack is suspended or
  resumed; `kb.stackVersion` counts them.
- **L17** `kb.updateLayer(layer, { bindings, options })` changes a live layer in
  place: it keeps its position, still under a layer pushed after it. A layer's
  keys changing is not the layer opening again. A new `parent` moves it into
  that owner's subtree; `{ parent: undefined }` makes it a root again.
  `updateLayer` REPLACES the layer's options object, so change options through
  it, not by mutating an object you kept.

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
const kb = createKeyboard(); // module scope: one per app

function Root() {
  // binds in an effect, never in render; new nodes go through setNodes (L12)
  const scopes = useScopeBinding(kb, {
    nodes,
    scopes: ["global", "list", "thread"],
    mounted: ["editor", "suggestions"],
    ctx,
    activeScopes,
    onActivate,
    onDisabled,
  });
  return (
    <KeyboardProvider keyboard={kb} scopes={scopes}> {/* the one listener (L15) */}
      <App />
    </KeyboardProvider>
  );
}

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

- `useScopeBinding(kb, options)` owns the app's binding: it CREATES it during
  render (`createScopes`, which pushes nothing) and ATTACHES it in a layout
  effect, so it exists on the first render and every `KeyboardScope` mounts in
  tree order. New `nodes` go through `setNodes` for you, only when they are
  different node objects (a new array of the same nodes is no change): build
  the nodes once, or memoize them. Never call `bindScopes` in render: it pushes
  layers, and StrictMode's second render pass would leave a binding nobody
  disposes.
- `KeyboardScope` / `useKeyboardScope(scope, options)` mount a scope for as long
  as the component is mounted.
- Layers are pushed and popped in LAYOUT effects: when a Suspense boundary that
  was showing suspends again, React hides its content and tears those down, so
  a hidden screen's keys leave the stack with it.
- `KeyboardLayer` / `useKeyboardLayer(bindings, options)` push plain bindings,
  for keys that are not commands. A layer is pushed when the component mounts
  and popped when it unmounts. Everything else is applied in place (L17): new
  handlers, a new set of keys, a new `modal` or `passThrough`, a new owner,
  `enabled`. A new `id` prop is a new layer.
- OPEN AND CLOSE ARE MOUNT AND UNMOUNT. Render the layer when the thing opens
  and stop rendering it when it closes; that is when it takes its place on the
  stack (L3). `enabled` is only for switching an open layer off for a while (a
  dialog playing its exit animation, a field with no results): it keeps the
  layer and its children on the stack, not live, and switching it back on is
  not an open, so it does not jump above a palette opened meanwhile. Never use
  `enabled` as the open state of a popup that stays mounted (`keepMounted`): it
  would keep the place it had when it was FIRST mounted, under whatever opened
  since. Render its layer only while it is open instead.
- A new set of `scopes` or `mounted` names makes `useScopeBinding` a new
  binding, and a new `scope` or `id` prop re-mounts a layer: to the stack that is
  a close and an open, so it lands on top, and so do the layers inside it.
  Declare scope names and layer ids statically. Changed commands never do that.
- The `parent` of every layer is the nearest layer around it in the React tree,
  through portals too: a popover rendered into `document.body` from inside a
  dialog is still the dialog's child (L3). Nobody passes an id by hand.
- `useKeyboardStack()` is `describeStack()` that re-renders on every push, pop
  and update, for hints and a help sheet. Facts are read at render: re-render
  when they change.
- `useKeyboard()` is the keyboard itself (chord mode, suspend).

### Recipes

**A dialog, menu or popover from a headless library.** Wrap its content in a
`KeyboardScope` (or `KeyboardLayer`) with `modal`, and let that layer own
Escape. Then stop the library from also acting on Escape, or one press closes
two things. With Base UI, in `onOpenChange`, for the `escape-key` reason call
BOTH `details.cancel()` and `details.allowPropagation()`. Read from Base UI
1.8's `useDismiss`: on Escape it calls `preventDefault` unless the change was
cancelled, and `stopPropagation` unless propagation was allowed. With `cancel()`
alone the key never reaches the kernel's listener, and Escape does nothing.

```tsx
<Dialog.Root
  open={open}
  onOpenChange={(next, details) => {
    if (!next && details.reason === "escape-key") {
      details.cancel(); // Base UI does not close it...
      details.allowPropagation(); // ...and lets the key reach the kernel
      return;
    }
    setOpen(next);
  }}
>
  <Dialog.Popup>
    {/* mounted with the popup; switched off while it animates closed */}
    <KeyboardScope scope="editor" modal passThrough={["mod+k"]} enabled={open}>
      ...
    </KeyboardScope>
  </Dialog.Popup>
</Dialog.Root>
```

Base UI keeps a closing popup mounted until its exit animation ends, so the
layer inside it is still up for that long: `enabled={open}` switches it (and
everything it holds) off the moment the dialog starts closing, and a second
Escape reaches what is underneath. For a popup that stays mounted while closed
(`keepMounted`), render the layer only while it is open (`{open && ...}`)
instead: see "open and close are mount and unmount".

The key then reaches the dialog's layer unprevented, which runs your close or
discard command, and that command can ask first ("Discard this draft?"). Base
UI calls `onOpenChange(false, "escape-key")` more than once for one Escape (from
the popup's own key handler and from its document listener), and a dialog's
handler also runs while a nested popover takes the key: do nothing else in that
branch. A host
using this recipe should keep a browser test with the real library, since a
library update can change it.

**A widget of your own with keys** (a suggestion list, a tag picker). Declare
its keys as commands in a mounted scope and mount it while the widget is open.
Not an `onKeyDown` with `stopPropagation`: that key would be invisible to the
stack, to hints and to the help sheet, and it only wins by DOM order.

**The palette over a dialog.** The palette is a modal layer of its own. It is
pushed after the dialog's, so it sits on top; closing it hands the keys back to
the dialog (L1).

**Hints that never lie.** Draw a button's key hint from the command node, and
show it only when `describeStack().reachable` has that key for that node.
