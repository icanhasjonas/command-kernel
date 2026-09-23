/**
 * The layer stack for the keyboard driver (keyboard.ts): LIFO layers of
 * bindings, plus which node each `registerShortcuts` binding runs. Owns no
 * chord state and does no dispatch - `keyboard-dispatch.ts` reads `layers`
 * (and `nodesFor`) to decide what a keystroke does.
 */

import { normalizeShortcut } from "./keyboard-normalize.js";
import type {
  KeyBindings,
  KeyLayer,
  KeyLayerOptions,
  ShortcutDriverOptions,
} from "./keyboard-types.js";
import { parseShortcut } from "./shortcut.js";
import type { CommandNode } from "./types.js";

/** Whether a layer takes part right now: not disabled, and live if it asks (`active`). */
export function isLive(layer: KeyLayer): boolean {
  if (layer.options.enabled === false) return false;
  return layer.options.active?.() ?? true;
}

export interface LayerStack {
  /** the live stack, base layers first - mutated in place, so this reference stays valid */
  readonly layers: readonly KeyLayer[];
  pushLayer(bindings: KeyBindings, options?: KeyLayerOptions): KeyLayer;
  popLayer(layer: KeyLayer): void;
  /** bind a Map of shortcut strings -> nodes as one base layer */
  registerShortcuts(nodes: Map<string, CommandNode>, options: ShortcutDriverOptions): KeyLayer;
  /** push a layer whose bindings each run a known node (recorded for `chordCompletions`) */
  pushNodeLayer(
    bindings: KeyBindings,
    options: KeyLayerOptions,
    nodes: Map<string, CommandNode>,
  ): KeyLayer;
  /** which node a `registerShortcuts` layer's binding runs, or undefined for a plain `pushLayer` */
  nodesFor(layer: KeyLayer): Map<string, CommandNode> | undefined;
  isBindingRegistered(pattern: string, excludeLayerId?: string): boolean;
}

export function createLayerStack(): LayerStack {
  const layers: KeyLayer[] = [];
  /**
   * Which node each binding of a `registerShortcuts` layer runs.
   *
   * A WeakMap keyed by the layer, so it cannot outlive a popped layer and there is nothing to
   * clean up in `popLayer` -- the alternative is a second registry that has to be kept in step
   * with `layers` by hand, and forgetting one line there is a leak nobody sees.
   */
  const layerNodes = new WeakMap<KeyLayer, Map<string, CommandNode>>();

  function pushLayer(bindings: KeyBindings, layerOptions: KeyLayerOptions = {}): KeyLayer {
    const layer: KeyLayer = {
      id: layerOptions.id ?? `layer-${layers.length}`,
      bindings,
      options: layerOptions,
    };
    if (layerOptions.base) {
      const firstNonBase = layers.findIndex((l) => !l.options.base);
      if (firstNonBase === -1) layers.push(layer);
      else layers.splice(firstNonBase, 0, layer);
    } else {
      layers.push(layer);
    }
    return layer;
  }

  return {
    layers,
    pushLayer,
    popLayer(layer) {
      const i = layers.indexOf(layer);
      if (i !== -1) layers.splice(i, 1);
    },
    registerShortcuts(nodes, driverOptions) {
      const bindings: KeyBindings = {};
      // The node is kept BESIDE the binding, not inside the closure. A `KeyHandler` is an opaque
      // function once registered, so a layer built here could say which keys it owned but never
      // what any of them ran -- which is the whole thing `chordCompletions` has to report.
      const byShortcut = new Map<string, CommandNode>();
      for (const [shortcut, node] of nodes) {
        const normalized = normalizeShortcut(parseShortcut(shortcut));
        bindings[normalized] = () => driverOptions.onActivate(node);
        byShortcut.set(normalized, node);
      }
      const layer = pushLayer(bindings, { base: true, id: "kernel-shortcuts" });
      layerNodes.set(layer, byShortcut);
      return layer;
    },
    pushNodeLayer(bindings, layerOptions, nodes) {
      const layer = pushLayer(bindings, layerOptions);
      layerNodes.set(layer, nodes);
      return layer;
    },
    nodesFor(layer) {
      return layerNodes.get(layer);
    },
    isBindingRegistered(pattern, excludeLayerId) {
      // Compare in the dispatcher's own dialect, so `cmd+k`, `mod+k` and (off a
      // Mac) `ctrl+k` are recognised as the one physical chord they are. A chord
      // pattern is normalized segment by segment.
      const canonical = (p: string) =>
        p
          .trim()
          .split(/\s+/)
          .map((seg) => normalizeShortcut(parseShortcut(seg)))
          .join(" ");
      const wanted = canonical(pattern);
      for (const layer of layers) {
        if (!isLive(layer)) continue;
        if (excludeLayerId !== undefined && layer.id === excludeLayerId) continue;
        for (const key of Object.keys(layer.bindings)) {
          if (canonical(key) === wanted) return true;
        }
      }
      return false;
    },
  };
}
