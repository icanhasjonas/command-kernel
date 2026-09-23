---
"@command-kernel/core": minor
"@command-kernel/react": minor
---

One keyboard layer stack, ordered by numbered and tested laws (docs/keyboard.md, "Layers").

- Layers take `parent` (sits above its owner whatever the push order), `modal` (a barrier)
  and `passThrough` (keys that cross it). `updateLayer` changes a live layer in place;
  `describeStack`, `subscribeStack` and `stackVersion` expose the stack as data.
- `bindScopes` takes `mounted` scopes: `binding.mount(scope, options)` puts a scope's
  commands on the stack while something is open. `binding.setNodes(nodes)` swaps the
  commands of every layer the binding has up, without moving any of them.
- A press while an input method is composing is never a command.
- New package `@command-kernel/react`: `KeyboardProvider` (the one listener, bubble phase),
  `KeyboardLayer`, `KeyboardScope`, `useKeyboardStack`, `attachKeyboard`.

BEHAVIOUR CHANGES for existing hosts (a 0.x minor):

- `bindScopes` layers are base layers now, and `registerShortcuts`' layer sits below them.
  A plain `pushLayer` (not base) wins a key from a scope wherever it was pushed; before, a
  scope bound later won.
- The nearest layer that knows a key decides it, whether it binds the key or a chord that
  starts with it. Before, a chord prefix bound anywhere armed before any single key.
- `pushLayer` bindings are canonical: `mod+enter` fires on the press (it never did). Two
  spellings of one key in one layer, and a second live layer with an id already on the
  stack, throw.
- On a Mac, a binding written `ctrl+k` no longer fires on Cmd+K (nor `mod+k` on Ctrl+K).
- Named keys: the alias table gains `insert`, `printscreen`, `contextmenu`, `capslock`,
  `numlock`, `scrolllock`, `pause`. Any other named key is matched as written, as
  `KeyboardEvent.key` spells it (so `isBindingRegistered` and `validateShortcuts` are
  case-sensitive for those), and a lower-case name nobody knows (`mediaplaypause`) THROWS:
  it could never fire. A literal `" "` binds Space.
- New throws: a second live layer with an id already on the stack; two spellings of one key
  in one layer or one `registerShortcuts` map; an unknown lower-case key name; `mount` on a
  disposed binding. Facts-scope and `registerShortcuts` ids are fresh per call now
  (`scope:thread:3`, `kernel-shortcuts:0`), so binding twice does not collide.
- Chords, every step: the nearest layer that knows a key sequence decides it, and in one
  layer a chord beats a single key. So with `g p` and `g p x` in one layer, `g p` now arms
  toward `g p x` (it used to fire). `chordCompletions` lists only keys that would run
  something, as the press would decide them.
- `pushLayer` copies bindings that are not canonical, so a host that keeps the object it
  passed in and changes it later changes nothing; `updateLayer` replaces a layer's options
  object, so mutate options through it.
- `registerShortcuts`' layer sits below every base layer, including ones pushed after it.
- `keyboard.describeStack()` and `useKeyboardStack` build the facts once per description.
- `validateShortcuts` reports a shortcut that cannot bind (a new optional `problem` on
  `ShortcutConflict`) instead of throwing; `isBindingRegistered` throws on a pattern that
  cannot bind.
- `Keyboard` gained required members (`describeStack`, `subscribeStack`, `stackVersion`,
  `updateLayer`): a type break for code that implements or mocks the interface.
- A chord crosses a modal barrier only when `passThrough` names the whole sequence
  (`"g i"`, not `"g"`). `passThrough` is checked when the layer is pushed.
- `describeStack` foresees a scope command that would decline (`when`, `disabled`) and
  reports what the press reaches instead; a suspended stack reaches nothing, and
  `setSuspended` notifies stack subscribers. `chordCompletions` is the same description one
  step past its prefix (in any spelling).
- A press that a widget already handled, or that an input method is composing, ends a
  pending chord.
- `@command-kernel/react`: `useScopeBinding` binds in an effect; layers are pushed in layout
  effects (a re-suspended Suspense boundary takes its layers off the stack).
