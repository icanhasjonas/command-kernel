import type { CommandNode, Ctx } from "./types.js";

/**
 * Whether a node can run right now, read the one way every driver reads it: the palette greys a
 * row with this reason, the keyboard lets the key fall through, `executeNode` refuses.
 */

/** The scope a node without one lives in. */
export const GLOBAL_SCOPE = "global";

/** Why `node` cannot run under `ctx`, or null when it can. An empty reason still disables. */
export function disabledReason(node: CommandNode, ctx: Ctx): string | null {
  const reason = node.disabled?.(ctx);
  return reason === undefined ? null : reason;
}

/** The keyboard scopes a node's shortcut lives in: its `scope`, or `["global"]`. */
export function nodeScopes(node: CommandNode): readonly string[] {
  if (node.scope === undefined) return [GLOBAL_SCOPE];
  return typeof node.scope === "string" ? [node.scope] : node.scope;
}
