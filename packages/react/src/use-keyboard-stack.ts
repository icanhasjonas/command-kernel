import type { StackDescription } from "@command-kernel/core";
import { useCallback, useSyncExternalStore } from "react";
import { useKeyboardContext } from "./keyboard-context.js";

/**
 * The live stack as data (law L14), re-rendered on every push, pop and update (L16): for key
 * hints that only show keys a press would reach, a help sheet that lists the top layer first, and
 * debugging. An external store keyed on `stackVersion`, so a change made by a sibling's effect
 * before this one subscribed is not missed. Liveness that comes from facts (a scope's `active`)
 * is read at render, fresh, not subscribed to: re-render when the facts change.
 */
export function useKeyboardStack(): StackDescription {
  const { keyboard } = useKeyboardContext();
  const version = useCallback(() => keyboard.stackVersion, [keyboard]);
  useSyncExternalStore(keyboard.subscribeStack, version, version);
  return keyboard.describeStack();
}
