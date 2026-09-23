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
- A named key outside the alias table is matched as written, as `KeyboardEvent.key` spells
  it (`Insert`, `PrintScreen`), and a literal `" "` binds Space.
