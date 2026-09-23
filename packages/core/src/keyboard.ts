/**
 * Framework-agnostic keyboard driver for the command kernel: ONE stack of layers per app that
 * every key goes through, ordered by the laws in docs/keyboard.md ("Layers").
 *
 *   const kb = createKeyboard();
 *   window.addEventListener("keydown", kb.handleKeydown); // BUBBLE: widgets first (L7)
 *
 * (`@command-kernel/react` does that line for a React host: `attachKeyboard`, law L15.)
 * Core never touches window/document/KeyboardEvent - events arrive as the
 * structural `KernelKeyEvent`, which any real browser event satisfies. State
 * is INSTANCE-scoped (like every other seam): two kernels on one page get two
 * independent layer stacks, never shared chord state. React hosts use
 * `@command-kernel/react`, which pushes and pops layers with the component tree.
 *
 * Features:
 * - Layer stacking: base, owned (`parent`), modal barriers with `passThrough`
 * - Chord sequences (leader key -> timeout -> fire)
 * - Platform-agnostic key normalization (mod = Cmd on Mac, Ctrl elsewhere)
 * - Context layers: `bindScopes` puts a node list on one layer per scope,
 *   live by facts or mounted while something is open
 * - The stack as data (`describeStack`), and conflict detection
 *
 * Split by responsibility, this file composing the rest: `keyboard-normalize.ts`
 * (key normalization, pure), `keyboard-types.ts` (the public shapes),
 * `keyboard-layers.ts` (the ordered stack), `keyboard-chord.ts` (chord-mode
 * state), `keyboard-dispatch.ts` (turning a keydown into a call),
 * `keyboard-scopes.ts` (node lists by context), `keyboard-describe.ts` (the
 * stack as data) and `keyboard-conflicts.ts` (static `validateShortcuts`).
 */

import { canonicalBinding } from "./keyboard-canonical.js";
import { createChordState } from "./keyboard-chord.js";
import { describeStack } from "./keyboard-describe.js";
import { createDispatch } from "./keyboard-dispatch.js";
import { createLayerStack } from "./keyboard-layers.js";
import { isEditableTarget } from "./keyboard-normalize.js";
import { createScopes } from "./keyboard-scopes.js";
import type { Keyboard, KeyboardOptions } from "./keyboard-types.js";

export function createKeyboard(options: KeyboardOptions = {}): Keyboard {
  const stack = createLayerStack();
  const chord = createChordState(options.chordTimeoutMs ?? 2000);
  const editableTarget = options.isEditableTarget ?? isEditableTarget;
  let suspended = false;
  const dispatch = createDispatch({ stack, chord, editableTarget, isSuspended: () => suspended });
  // one token for the whole description: the facts are read once, and fresh (L14)
  const describe = () => dispatch.within(() => describeStack(stack, suspended));

  return {
    handleKeydown: dispatch.handleKeydown,
    pushLayer: stack.pushLayer,
    popLayer: stack.popLayer,
    registerShortcuts: stack.registerShortcuts,
    bindScopes: (scopeOptions) => {
      const binding = createScopes(stack, scopeOptions, dispatch);
      binding.attach();
      return binding;
    },
    createScopes: (scopeOptions) => createScopes(stack, scopeOptions, dispatch),
    subscribeChordMode: chord.subscribeChordMode,
    onDeclined: dispatch.onDeclined,
    exitChordMode: chord.exitChordMode,
    setChordTimeout: chord.setChordTimeout,
    setSuspended(value) {
      if (value === suspended) return;
      suspended = value;
      // A prefix armed before the mute would still be sitting there when the
      // stack wakes up, and would then eat the next unrelated keystroke.
      if (value) chord.exitChordMode();
      // what a press reaches just changed (nothing, or everything again): hints must redraw
      stack.touch();
    },
    get suspended() {
      return suspended;
    },
    chordCompletions: (prefix) => {
      const armed = prefix === undefined ? chord.chordPrefix : canonicalBinding(prefix);
      if (armed === null) return [];
      const head = `${armed} `;
      // what the description says a press reaches, one step past the prefix: the same decision
      return describe().reachable.flatMap(({ binding, node }) => {
        const key = binding.slice(head.length);
        if (!binding.startsWith(head) || key.includes(" ")) return [];
        return [node === undefined ? { key, shortcut: binding } : { key, shortcut: binding, node }];
      });
    },
    isBindingRegistered: stack.isBindingRegistered,
    get chordPrefix() {
      return chord.chordPrefix;
    },
    describeStack: describe,
    subscribeStack: stack.subscribe,
    get stackVersion() {
      return stack.version;
    },
    updateLayer: stack.updateLayer,
  };
}

export { canonicalBinding } from "./keyboard-canonical.js";
export type { ShortcutConflict } from "./keyboard-conflicts.js";
export { validateShortcuts } from "./keyboard-conflicts.js";
export type { LayerInfo, ReachableKey, StackDescription } from "./keyboard-describe.js";
export type { KernelKeyEvent } from "./keyboard-normalize.js";
export {
  isEditableTarget,
  normalizeEvent,
  normalizeShortcut,
} from "./keyboard-normalize.js";
export type {
  ChordCompletion,
  ChordListener,
  DeclinedListener,
  KeyBindings,
  Keyboard,
  KeyboardOptions,
  KeyHandler,
  KeyLayer,
  KeyLayerOptions,
  LayerUpdate,
  MountOptions,
  ScopeBinding,
  ScopeBindingOptions,
  ShortcutDriverOptions,
} from "./keyboard-types.js";
