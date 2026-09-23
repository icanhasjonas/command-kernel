/**
 * The live layer stack as data (law L14): which layers are up, top first, and which keys a press
 * would reach right now. Built on the SAME walk a press makes (`walk` in keyboard-dispatch.ts) -
 * top down, barriers respected, the nearest layer that knows a key keeps it, whether it binds the
 * key or a chord starting with it - so a key hint or a help sheet built from it cannot offer a
 * key that something above would take first. A node may still decline (`when`, `disabled`).
 */

import { walk } from "./keyboard-dispatch.js";
import type { LayerStack } from "./keyboard-layers.js";
import { isLive } from "./keyboard-layers.js";
import type { ReachableKey, StackDescription } from "./keyboard-types.js";

/** `g i` -> `g`; a single key is its own first step */
const firstStep = (binding: string) => binding.split(" ")[0] ?? binding;

export function describeStack(stack: LayerStack): StackDescription {
  const reachable = new Map<string, ReachableKey>();
  /** first steps a layer above already decided: as a single key, or as a chord prefix */
  const taken = new Map<string, "key" | "chord">();
  for (const [layer, reaches] of walk(stack)) {
    const nodes = stack.nodesFor(layer);
    const mine = Object.keys(layer.bindings).filter((b) => reaches(b));
    const decided = new Map<string, "key" | "chord">();
    for (const binding of mine) {
      const step = firstStep(binding);
      const kind = binding.includes(" ") ? "chord" : "key";
      // a single key above shadows a chord below that starts with it, and a chord above
      // shadows a single key below: the press never gets that far (L1)
      const above = taken.get(step);
      if (reachable.has(binding) || (above !== undefined && above !== kind)) continue;
      if (kind === "key" && mine.some((b) => b.startsWith(`${binding} `))) continue; // arms here
      const node = nodes?.get(binding);
      reachable.set(
        binding,
        node === undefined ? { binding, layerId: layer.id } : { binding, layerId: layer.id, node },
      );
      decided.set(step, kind === "chord" || decided.get(step) === "chord" ? "chord" : "key");
    }
    for (const [step, kind] of decided) if (!taken.has(step)) taken.set(step, kind);
  }
  return {
    layers: [...stack.layers].reverse().map((layer) => ({
      id: layer.id,
      ...(layer.options.parent === undefined ? {} : { parent: layer.options.parent }),
      base: layer.options.base === true,
      modal: layer.options.modal === true,
      live: isLive(layer),
      keys: Object.keys(layer.bindings),
    })),
    reachable: [...reachable.values()],
  };
}
