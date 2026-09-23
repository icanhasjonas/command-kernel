/** Static shortcut-conflict detection for the keyboard driver (keyboard.ts). */

import { GLOBAL_SCOPE, nodeScopes } from "./availability.js";
import { canonicalBinding } from "./keyboard-canonical.js";
import type { CommandNode } from "./types.js";

export interface ShortcutConflict {
  shortcut: string;
  nodeIds: string[];
  /** set when the shortcut cannot bind at all (an unknown key name): why */
  problem?: string;
  /** the scope both nodes are in; absent for the global one */
  scope?: string;
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
  // scope -> binding -> node ids: one key in two SCOPES is the point of scopes, not a conflict
  const byScope = new Map<string, Map<string, string[]>>();
  const broken: ShortcutConflict[] = [];
  for (const [shortcut, node] of pairs) {
    // the SAME canonical form the dispatcher registers under, so two spellings
    // of one physical chord (mod+k / cmd+k, and ctrl+k off a Mac) collide here;
    // one that cannot bind at all is reported, not thrown: this is the audit
    let key: string;
    try {
      key = canonicalBinding(shortcut);
    } catch (err) {
      broken.push({ shortcut, nodeIds: [node.id], problem: (err as Error).message });
      continue;
    }
    for (const scope of nodeScopes(node)) {
      const keys = byScope.get(scope) ?? new Map<string, string[]>();
      keys.set(key, [...(keys.get(key) ?? []), node.id]);
      byScope.set(scope, keys);
    }
  }
  return [
    ...broken,
    ...[...byScope.entries()].flatMap(([scope, keys]) =>
      [...keys.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([shortcut, nodeIds]) =>
          scope === GLOBAL_SCOPE ? { shortcut, nodeIds } : { shortcut, nodeIds, scope },
        ),
    ),
  ];
}
