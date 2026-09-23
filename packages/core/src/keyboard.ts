/**
 * Framework-agnostic keyboard driver for the command kernel.
 *
 * Ported from remote-claude's key-layers system (battle-tested). Stripped of
 * React and terminal-specific concerns -- the kernel owns the state machine,
 * the HOST owns the DOM listener and React hooks:
 *
 *   const kb = createKeyboard();
 *   window.addEventListener("keydown", kb.handleKeydown, { capture: true });
 *
 * Core never touches window/document/KeyboardEvent - events arrive as the
 * structural `KernelKeyEvent`, which any real browser event satisfies. State
 * is INSTANCE-scoped (like every other seam): two kernels on one page get two
 * independent layer stacks, never shared chord state.
 *
 * Features:
 * - Layer stacking (LIFO, base vs modal)
 * - Chord sequences (leader key -> timeout -> fire)
 * - Platform-agnostic key normalization (mod = Cmd on Mac, Ctrl elsewhere)
 * - Context layers: `bindScopes` puts a node list on one layer per scope
 * - Conflict detection
 *
 * Split by responsibility across five files, this one composing the rest:
 * `keyboard-normalize.ts` (key normalization, pure), `keyboard-types.ts` (the
 * public shapes), `keyboard-layers.ts` (the layer stack), `keyboard-chord.ts`
 * (chord-mode state), `keyboard-dispatch.ts` (turning a keydown into a call),
 * and `keyboard-conflicts.ts` (static `validateShortcuts`).
 */

import { createChordState } from "./keyboard-chord.js";
import { createDispatch } from "./keyboard-dispatch.js";
import { createLayerStack } from "./keyboard-layers.js";
import { isEditableTarget } from "./keyboard-normalize.js";
import { bindScopes } from "./keyboard-scopes.js";
import type { Keyboard, KeyboardOptions } from "./keyboard-types.js";

export function createKeyboard(options: KeyboardOptions = {}): Keyboard {
  const stack = createLayerStack();
  const chord = createChordState(options.chordTimeoutMs ?? 2000);
  const editableTarget = options.isEditableTarget ?? isEditableTarget;
  let suspended = false;
  const dispatch = createDispatch({ stack, chord, editableTarget, isSuspended: () => suspended });

  return {
    handleKeydown: dispatch.handleKeydown,
    pushLayer: stack.pushLayer,
    popLayer: stack.popLayer,
    registerShortcuts: stack.registerShortcuts,
    bindScopes: (scopeOptions) => bindScopes(stack, scopeOptions, dispatch.press),
    subscribeChordMode: chord.subscribeChordMode,
    exitChordMode: chord.exitChordMode,
    setChordTimeout: chord.setChordTimeout,
    setSuspended(value) {
      suspended = value;
      // A prefix armed before the mute would still be sitting there when the
      // stack wakes up, and would then eat the next unrelated keystroke.
      if (value) chord.exitChordMode();
    },
    get suspended() {
      return suspended;
    },
    chordCompletions: dispatch.chordCompletions,
    isBindingRegistered: stack.isBindingRegistered,
    get chordPrefix() {
      return chord.chordPrefix;
    },
  };
}

export type { ShortcutConflict } from "./keyboard-conflicts.js";
export { validateShortcuts } from "./keyboard-conflicts.js";
export type { KernelKeyEvent } from "./keyboard-normalize.js";
export { isEditableTarget, normalizeEvent, normalizeShortcut } from "./keyboard-normalize.js";
export { canonicalBinding } from "./keyboard-scopes.js";
export type {
  ChordCompletion,
  ChordListener,
  KeyBindings,
  Keyboard,
  KeyboardOptions,
  KeyHandler,
  KeyLayer,
  KeyLayerOptions,
  ScopeBinding,
  ScopeBindingOptions,
  ShortcutDriverOptions,
} from "./keyboard-types.js";
