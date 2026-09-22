import type { ArgValues } from "./args.js";
import { pathKey } from "./evidence.js";
import { signingArgs } from "./signing.js";
import type { CommandNode } from "./types.js";

/** One hop of a walked chain: the node, and the args it was reached (resolved) with. */
export interface Hop {
  node: CommandNode;
  args?: ArgValues;
}

/**
 * The key of a walked chain, every hop keyed with its args in their canonical
 * signing form. `command()` binds a tip's grant to the hops before it with this, and
 * any driver that walks a chain itself (the palette) must key it the SAME way, or
 * a grant minted under `box(id=inbox) > purge` would verify under `box(id=archive)`.
 */
export function hopsKey(hops: Hop[]): string {
  return pathKey(hops.map((h) => ({ id: h.node.id, args: signingArgs(h.node, h.args ?? {}) })));
}
