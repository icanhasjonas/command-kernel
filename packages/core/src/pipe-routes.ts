import type { ArgSpec, ValueType } from "./args.js";
import { enumerateMode } from "./describe.js";
import { type Hop, hopArgs, hopsKey } from "./hops-key.js";
import { resolveChildren } from "./kernel.js";
import { acceptingArg } from "./pipe.js";
import type { CommandNode, Ctx, PathSegment } from "./types.js";

/**
 * Incoming routing: given a value, which commands could take it? "I have a person -
 * what can I do with it?" is Quicksilver's second pane, asked of the whole tree.
 */

/** A command a value can be piped into, and how to address and gate it. */
export interface PipeAction {
  node: CommandNode;
  /** the path that addresses it from the root (its own segment last) */
  path: PathSegment[];
  /** canonical key of the hops before it - the `priorKey` its grant binds to */
  priorKey: string;
  /** the arg the value lands in */
  arg: ArgSpec;
}

export interface ActionsForOptions {
  /** how many levels below the roots to look (default 4) */
  maxDepth?: number;
}

/**
 * Every runnable command, anywhere in the tree, with an arg that accepts `type`.
 * Only branches that are FREE to enumerate are walked (the same rule an agent's
 * scout follows): a "query" branch hits a backend and needs a search term, so the
 * commands behind it are reached by searching, not by routing. A branch whose
 * resolve() throws is skipped; one bad provider does not hide everyone else's.
 * `when` and `hide` are honoured, as in the palette's search.
 */
export async function actionsFor(
  roots: CommandNode[],
  type: ValueType,
  ctx: Ctx,
  opts: ActionsForOptions = {},
): Promise<PipeAction[]> {
  const maxDepth = opts.maxDepth ?? 4;
  const out: PipeAction[] = [];

  async function visit(nodes: CommandNode[], hops: Hop[]): Promise<void> {
    for (const node of nodes) {
      if (node.when && !node.when(ctx)) continue;
      if (typeof node.hide === "function" ? node.hide(ctx) : node.hide) continue;
      if (hops.some((h) => h.node.id === node.id)) continue; // a cycle, not a deeper level
      const arg = node.run ? acceptingArg(node, type) : null;
      if (arg) {
        const path = [...hops.map((h) => ({ id: h.node.id })), { id: node.id }];
        out.push({ node, path, priorKey: hopsKey(hops), arg });
      }
      if (hops.length >= maxDepth || enumerateMode(node) !== "free") continue;
      const args = hopArgs(node, undefined, ctx);
      const children = await resolveChildren(node, args, ctx).catch(() => []);
      await visit(children, [...hops, { node, args }]);
    }
  }

  await visit(roots, []);
  return out;
}
