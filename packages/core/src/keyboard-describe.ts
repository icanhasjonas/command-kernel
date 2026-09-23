/**
 * The live layer stack as data (law L14): which layers are up, top first, and which keys a press
 * would reach right now. Reachability is `decide` (keyboard-dispatch.ts) at every step of a
 * binding: each earlier step must arm, and the whole of it must be this layer's key, taken
 * without declining as far as the stack can know (a node layer's `when` and `disabled`). The
 * press walks the same candidates, so a key hint or a help sheet built from this cannot offer a
 * key that something above would take first. A suspended stack reaches nothing.
 */

import { type Candidate, decide, walk } from "./keyboard-dispatch.js";
import type { LayerStack } from "./keyboard-layers.js";
import type { KeyLayer } from "./keyboard-types.js";
import type { CommandNode } from "./types.js";

/** One layer as `describeStack` reports it. */
export interface LayerInfo {
  id: string;
  parent?: string;
  base: boolean;
  modal: boolean;
  /** enabled, and `active()` (if any) says yes right now */
  live: boolean;
  /** its bindings, canonical */
  keys: string[];
}

/** A key a press would reach right now, and the layer (and node, if known) that has it. */
export interface ReachableKey {
  binding: string;
  layerId: string;
  node?: CommandNode;
}

export interface StackDescription {
  /** top first */
  layers: LayerInfo[];
  /** what a press would run: the nearest taker, barriers respected, foreseeable declines skipped */
  reachable: ReachableKey[];
}

export function describeStack(stack: LayerStack, suspended: boolean): StackDescription {
  const decisions = new Map<string, Candidate | null>();
  const decided = (binding: string) => {
    if (!decisions.has(binding)) decisions.set(binding, decide(stack, binding));
    return decisions.get(binding) ?? null;
  };
  const reaches = (binding: string, layer: KeyLayer) => {
    const steps = binding.split(" ");
    for (let i = 1; i < steps.length; i++) {
      if (decided(steps.slice(0, i).join(" "))?.kind !== "arm") return false;
    }
    const d = decided(binding);
    return d?.kind === "key" && d.layer === layer;
  };

  const live = new Set<KeyLayer>();
  const reachable: ReachableKey[] = [];
  for (const [layer] of walk(stack)) {
    live.add(layer);
    if (suspended) continue;
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
      live: live.has(layer),
      keys: Object.keys(layer.bindings),
    })),
    reachable,
  };
}
