import type { ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { pathKey } from "./evidence-key.js";
import { setOwn } from "./own.js";
import { signingArgs } from "./signing.js";
import type { CommandNode, Ctx } from "./types.js";

/** One hop of a walked chain: the node, and the args its resolve() received. */
export interface Hop {
  node: CommandNode;
  args?: ArgValues;
}

/**
 * The args a hop's resolve() runs with: the node's `prefill(ctx)`, overlaid by the
 * args written on the segment, fitted to their declared kinds. `command()` resolves
 * every hop with this and keys the hop by the SAME value, and so must any driver
 * that walks a chain itself (the palette): the children a hop hands out depend on
 * everything resolve() saw, prefill included.
 */
export function hopArgs(node: CommandNode, args: ArgValues | undefined, ctx: Ctx): ArgValues {
  return coerceArgs(node, { ...(node.prefill ? node.prefill(ctx) : {}), ...(args ?? {}) });
}

/**
 * The key of a walked chain, every hop keyed with the args its resolve() received
 * (`hopArgs`), in their canonical signing form. `command()` binds a tip's grant to
 * the hops before it with this, and any driver that walks a chain itself must key
 * it the SAME way, or a grant minted under `box(id=inbox) > purge` would verify
 * under `box(id=archive)`.
 *
 * An empty text arg is no search at all, so it is left out of the key: the palette
 * opens a search step with `q: ""` and `command()` walks it with no args, and both
 * must bind a grant to the same `search()`.
 */
export function hopsKey(hops: Hop[]): string {
  return pathKey(hops.map((h) => ({ id: h.node.id, args: keyedArgs(h.node, h.args ?? {}) })));
}

/** A hop's args as keyed: the signing form, without empty text. */
function keyedArgs(node: CommandNode, args: ArgValues): ArgValues {
  const signed = signingArgs(node, args);
  const out: ArgValues = {};
  for (const [k, v] of Object.entries(signed)) if (v !== "") setOwn(out, k, v);
  return out;
}
