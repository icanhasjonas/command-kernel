/**
 * Fake keydowns for the keyboard tests. The driver takes the structural `KernelKeyEvent`, so a
 * plain object stands in for a browser event and records whether it was cancelled.
 */

import type { KernelKeyEvent } from "./keyboard-normalize.js";
import { isMac } from "./shortcut.js";

export type FakeKey = KernelKeyEvent & { prevented: boolean; stopped: boolean };

export function key(k: string, mods: Partial<KernelKeyEvent> = {}): FakeKey {
  const e = {
    key: k,
    code: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      e.prevented = true;
    },
    stopPropagation() {
      e.stopped = true;
    },
    ...mods,
  };
  return e;
}

/** the platform's `mod` modifier (Cmd on a Mac, Ctrl elsewhere) */
export const mod: Partial<KernelKeyEvent> = isMac ? { metaKey: true } : { ctrlKey: true };

/** a keydown carrying `mod` */
export const modKey = (k: string) => key(k, mod);
