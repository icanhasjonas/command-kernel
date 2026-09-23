/**
 * THE one place a browser host hears keys (law L15). `KeyboardProvider` calls it; a host without
 * React calls it directly: `attachKeyboard(keyboard, window)`.
 *
 * BUBBLE PHASE, DELIBERATELY. The kernel has to hear a key AFTER the focused widget did, so a
 * combobox's ArrowDown or a menu's Escape is handled there first and arrives here already
 * `defaultPrevented` (law L7). A capture listener runs before every widget and steals their keys.
 */

import type { KernelKeyEvent, Keyboard } from "@command-kernel/core";

export type KeyListener = (e: KernelKeyEvent) => void;

/** Anything a keydown can be heard on: `window`, `document`, an element, a test double. */
export interface KeySource {
  addEventListener(type: "keydown", listener: KeyListener): void;
  removeEventListener(type: "keydown", listener: KeyListener): void;
}

/** Feed `source`'s keydowns to `keyboard`, in the bubble phase. Returns the detach. */
export function attachKeyboard(
  keyboard: Pick<Keyboard, "handleKeydown">,
  source: KeySource,
): () => void {
  const listener: KeyListener = (e) => keyboard.handleKeydown(e);
  source.addEventListener("keydown", listener);
  return () => source.removeEventListener("keydown", listener);
}
