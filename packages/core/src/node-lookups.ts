import type { CommandNode, Ctx } from "./types.js";

/**
 * The lookups drivers build over a node list: chord and shortcut bindings, and the
 * frecency bump after a run. Split out of kernel.ts, which keeps the verbs.
 */

/** Flatten a node tree's chord bindings into a lookup for the chord leader. */
export function collectChords(nodes: CommandNode[]): Map<string, CommandNode> {
  const map = new Map<string, CommandNode>();
  for (const n of nodes) {
    if (n.chord) map.set(n.chord.toLowerCase(), n);
  }
  return map;
}

/**
 * Nodes that carry a `shortcut`, filtered by `when(ctx)`, keyed by the shortcut
 * string. NOTE: this is a lookup, so two nodes on the SAME shortcut collapse to
 * the last one: use `shortcutNodes` + `validateShortcuts` (or
 * `kernel.shortcutConflicts(ctx)`) to see the collision before it silently eats
 * a binding.
 */
export function collectShortcuts(nodes: CommandNode[], ctx: Ctx): Map<string, CommandNode> {
  const map = new Map<string, CommandNode>();
  for (const n of shortcutNodes(nodes, ctx)) map.set(n.shortcut as string, n);
  return map;
}

/** Every visible node that declares a `shortcut`, duplicates INCLUDED. */
export function shortcutNodes(nodes: CommandNode[], ctx: Ctx): CommandNode[] {
  return nodes.filter((n) => n.shortcut && (!n.when || n.when(ctx)));
}

export function bumpFrecency(frecency: Record<string, number>, id: string): Record<string, number> {
  return { ...frecency, [id]: (frecency[id] ?? 0) + 1 };
}
