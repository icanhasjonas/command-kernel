# @command-kernel/react

The keyboard layer stack of `@command-kernel/core`, bound to the React tree. One listener for
the whole app, and layers that push and pop with the components that own them: a dialog's keys
while the dialog is open, a suggestion list's keys above the dialog's while it is showing.
Depends on core and React, nothing else.

The rules the stack keeps are numbered laws in [docs/keyboard.md](../../docs/keyboard.md#layers),
each one a test.

```tsx
import { createKeyboard } from "@command-kernel/core";
import { KeyboardProvider, KeyboardScope, useScopeBinding } from "@command-kernel/react";

const kb = createKeyboard(); // module scope: one per app

function Root() {
  const scopes = useScopeBinding(kb, {
    nodes, // your commands; each declares its `shortcut` and `scope`
    scopes: ["global", "list"], // live by facts
    mounted: ["editor"], // live while mounted
    ctx,
    activeScopes,
    onActivate,
  });
  return (
    <KeyboardProvider keyboard={kb} scopes={scopes}>
      <App />
    </KeyboardProvider>
  );
}

function Editor() {
  // Escape and mod+Enter now mean whatever the "editor" commands say, and nothing below
  // this layer hears a key except mod+k
  return <KeyboardScope scope="editor" modal passThrough={["mod+k"]}>{/* ... */}</KeyboardScope>;
}
```

| Export | What it does |
| --- | --- |
| `KeyboardProvider` | attaches the one keydown listener (bubble phase) and hands the keyboard down |
| `useScopeBinding` | the app's scope binding: created in render (pushes nothing), attached in a layout effect; new nodes via `setNodes` |
| `KeyboardScope`, `useKeyboardScope` | mount one of the app's `mounted` scopes while mounted |
| `KeyboardLayer`, `useKeyboardLayer` | push plain bindings while mounted |
| `useKeyboardStack` | `describeStack()`, re-rendered on every push, pop and update |
| `useKeyboard` | the keyboard itself (chord mode, suspend) |
| `attachKeyboard` | the listener, for a host without React |

A layer's parent is the nearest layer around it in the React tree, portals included, so a
popover rendered into `document.body` from inside a dialog still sits above the dialog. A layer
is pushed on mount and popped on unmount; new keys, options, owner and `enabled` are applied in
place, so it never jumps above a layer opened after it (a new `id`, a new set of scope names or a
new `scope` prop is a new layer). `useScopeBinding` applies new `nodes` itself, and an inline
array of the same nodes is no change.
