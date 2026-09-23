/** Static shortcut-conflict detection for the keyboard driver (keyboard.ts). */

import { normalizeShortcut } from "./keyboard-normalize.js";
import { parseShortcut } from "./shortcut.js";
import type { CommandNode } from "./types.js";

export interface ShortcutConflict {
  shortcut: string;
  nodeIds: string[];
}

/**
 * Report shortcuts bound to more than one node, normalized so `mod+k` and
 * `cmd+k` (and, off a Mac, `ctrl+k`) count as the SAME binding.
 *
 * Pass a node LIST - a `Map` keyed by shortcut string has already collapsed the
 * duplicates this function exists to find, so it can only ever report conflicts
 * between different spellings of one key. `kernel.shortcutConflicts(ctx)` passes
 * the list for you.
 */
export function validateShortcuts(
  nodes: Map<string, CommandNode> | Iterable<CommandNode>,
): ShortcutConflict[] {
  const pairs: Array<[string, CommandNode]> =
    nodes instanceof Map
      ? [...nodes]
      : [...nodes].flatMap((n) => (n.shortcut ? [[n.shortcut, n] as [string, CommandNode]] : []));
  const byKey = new Map<string, string[]>();
  for (const [shortcut, node] of pairs) {
    const parsed = parseShortcut(shortcut);
    // the SAME canonical form the dispatcher registers under, so two spellings
    // of one physical chord (mod+k / cmd+k, and ctrl+k off a Mac) collide here
    const key = normalizeShortcut(parsed);
    const existing = byKey.get(key) ?? [];
    existing.push(node.id);
    byKey.set(key, existing);
  }
  return [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([shortcut, nodeIds]) => ({ shortcut, nodeIds }));
}
