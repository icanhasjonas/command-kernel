import type { ArgValues, CommandNode, Hop } from "@command-kernel/core";
import { hopsKey } from "@command-kernel/core";

/** One level of the palette's drill-down stack. */
export interface Frame {
  node: CommandNode | null;
  items: CommandNode[];
  dynamic: boolean; // node has a positional arg => the query IS the search term
  positionalArgId?: string;
  /** the args this frame's children were resolved with (core `hopArgs`: prefill included) */
  args: ArgValues;
}

/**
 * The chain of ancestor frames = the prior path a tip grant binds against, keyed
 * with each frame's resolve() args exactly as `command()` keys a path (core `hopsKey`).
 */
export function framesKey(frames: Frame[]): string {
  return hopsKey(frames.flatMap((f): Hop[] => (f.node ? [{ node: f.node, args: f.args }] : [])));
}
