import type { Keyboard, StackDescription } from "@command-kernel/core";
import { useCallback, useSyncExternalStore } from "react";
import { useKeyboardContext } from "./keyboard-context.js";

/** Which layers are up and live, as one comparable string: changes exactly when the stack does. */
const shape = (keyboard: Keyboard) =>
  keyboard
    .describeStack()
    .layers.map((l) => `${l.id}${l.live ? "" : "~"}`)
    .join("|");

/**
 * The live stack as data (law L14), re-rendered on every push and pop: for key hints that only
 * show keys a press would reach, a help sheet that lists the top layer first, and debugging.
 * An external store, so a layer pushed by a sibling's effect BEFORE this one subscribed is not
 * missed. Liveness that comes from facts (a scope's `active`) is read at render, not subscribed.
 */
export function useKeyboardStack(): StackDescription {
  const { keyboard } = useKeyboardContext();
  const snapshot = useCallback(() => shape(keyboard), [keyboard]);
  useSyncExternalStore(keyboard.subscribeStack, snapshot, snapshot);
  return keyboard.describeStack();
}
