/**
 * The live layer stack as data (law L14): which layers are up, top first, and which keys a press
 * would reach right now. Reachability is `decide` (keyboard-dispatch.ts) applied to every step of
 * a binding - the same decision a press makes - so a key hint or a help sheet built from it
 * cannot offer a key that something above would take first, at any chord length. A node may
 * still decline when pressed (`when`, `disabled`); that is not known until it runs.
 */

import { type Decision, decide, walk } from "./keyboard-dispatch.js";
import type { LayerStack } from "./keyboard-layers.js";
import type { KeyLayer, ReachableKey, StackDescription } from "./keyboard-types.js";

export function describeStack(stack: LayerStack): StackDescription {
  const decisions = new Map<string, Decision | null>();
  const decided = (binding: string) => {
    if (!decisions.has(binding)) decisions.set(binding, decide(stack, binding));
    return decisions.get(binding) ?? null;
  };
  /** `binding` runs from `layer` when every earlier step arms and the whole of it is `layer`'s key */
  const reaches = (binding: string, layer: KeyLayer) => {
    const steps = binding.split(" ");
    for (let i = 1; i < steps.length; i++) {
      if (decided(steps.slice(0, i).join(" "))?.kind !== "arm") return false;
    }
    const d = decided(binding);
    return d?.kind === "key" && d.layer === layer;
  };

  const live: KeyLayer[] = [];
  const reachable: ReachableKey[] = [];
  for (const [layer] of walk(stack)) {
    live.push(layer);
    const nodes = stack.nodesFor(layer);
    for (const binding of Object.keys(layer.bindings)) {
      if (!reaches(binding, layer)) continue;
      const node = nodes?.get(binding);
      reachable.push(
        node === undefined ? { binding, layerId: layer.id } : { binding, layerId: layer.id, node },
      );
    }
  }
  return {
    layers: [...stack.layers].reverse().map((layer) => ({
      id: layer.id,
      ...(layer.options.parent === undefined ? {} : { parent: layer.options.parent }),
      base: layer.options.base === true,
      modal: layer.options.modal === true,
      live: live.includes(layer),
      keys: Object.keys(layer.bindings),
    })),
    reachable,
  };
}
