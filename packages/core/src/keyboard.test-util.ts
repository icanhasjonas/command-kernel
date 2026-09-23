/**
 * Fake keydowns for the keyboard tests. The driver takes the structural `KernelKeyEvent`, so a
 * plain object stands in for a browser event and records whether it was cancelled.
 */

import { createKeyboard } from "./keyboard.js";
import type { KernelKeyEvent } from "./keyboard-normalize.js";
import { isMac } from "./shortcut.js";
import type { CommandNode, Ctx } from "./types.js";

export const testCtx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

/** a command node with a key, for binding */
export const cmd = (
  id: string,
  shortcut: string,
  extra: Partial<CommandNode> = {},
): CommandNode => ({
  id,
  title: id,
  shortcut,
  ...extra,
});

/** a keyboard and a log; `on(name)` is a handler that logs `name` */
export function rig() {
  const kb = createKeyboard();
  const hits: string[] = [];
  const on = (name: string) => () => {
    hits.push(name);
  };
  const run = (n: CommandNode) => {
    hits.push(n.id);
  };
  return { kb, hits, on, run };
}

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
