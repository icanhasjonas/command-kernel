/**
 * The live layer stack as data (law L14): which layers are up, top first, and which keys a press
 * would reach right now. The same walk a real press makes - top down, first owner wins, a modal
 * layer lets through only its `passThrough` - so a key hint or a help sheet built from it can
 * never offer a key that something above would swallow.
 */

import type { LayerStack } from "./keyboard-layers.js";
import { crosses, isLive } from "./keyboard-layers.js";
import type { ReachableKey, StackDescription } from "./keyboard-types.js";

export function describeStack(stack: LayerStack): StackDescription {
  const top = [...stack.layers].reverse();
  const reachable = new Map<string, ReachableKey>();
  // below a barrier, only what every barrier above lets through
  const barriers: typeof top = [];
  for (const layer of top) {
    if (!isLive(layer)) continue;
    const nodes = stack.nodesFor(layer);
    for (const binding of Object.keys(layer.bindings)) {
      if (reachable.has(binding)) continue;
      if (!barriers.every((b) => crosses(b, binding))) continue;
      const node = nodes?.get(binding);
      reachable.set(
        binding,
        node === undefined ? { binding, layerId: layer.id } : { binding, layerId: layer.id, node },
      );
    }
    if (layer.options.modal === true) barriers.push(layer);
  }
  return {
    layers: top.map((layer) => ({
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
