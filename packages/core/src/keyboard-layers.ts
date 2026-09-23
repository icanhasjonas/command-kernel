/**
 * The layer stack for the keyboard driver (keyboard.ts): the ordered layers of bindings, plus
 * which node each binding runs when it came from a node list. Owns no chord state and does no
 * dispatch - `keyboard-dispatch.ts` reads `layers` (and `nodesFor`) to decide what a keystroke
 * does. The ORDER is the whole contract, and docs/keyboard.md states it as laws L1-L3.
 */

import { canonicalBinding } from "./keyboard-normalize.js";
import type {
  KeyBindings,
  KeyLayer,
  KeyLayerOptions,
  ShortcutDriverOptions,
} from "./keyboard-types.js";
import type { CommandNode } from "./types.js";

/** Whether a layer takes part right now: not disabled, and live if it asks (`active`). */
export function isLive(layer: KeyLayer): boolean {
  if (layer.options.enabled === false) return false;
  return layer.options.active?.() ?? true;
}

/** Whether `binding` (canonical) crosses `layer`'s barrier: it is not modal, or lets it pass. */
export function crosses(layer: KeyLayer, binding: string): boolean {
  if (layer.options.modal !== true) return true;
  return (layer.options.passThrough ?? []).some((p) => canonicalBinding(p) === binding);
}

export interface LayerStack {
  /** the live stack, bottom first - re-sorted in place, so this reference stays valid */
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
  /** which node a binding of `layer` runs, or undefined for a plain `pushLayer` */
  nodesFor(layer: KeyLayer): Map<string, CommandNode> | undefined;
  isBindingRegistered(pattern: string, excludeLayerId?: string): boolean;
  subscribe(fn: () => void): () => void;
}

/** `bindings` with every key canonical (law L10); the same object when they already were. */
function canonical(bindings: KeyBindings): KeyBindings {
  const keys = Object.keys(bindings);
  if (keys.every((k) => canonicalBinding(k) === k)) return bindings;
  const out: KeyBindings = {};
  for (const k of keys) {
    const handler = bindings[k];
    if (handler) out[canonicalBinding(k)] = handler;
  }
  return out;
}

/** Lexicographic, a prefix first: an owner sorts below everything it owns. */
function comparePaths(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export function createLayerStack(): LayerStack {
  const layers: KeyLayer[] = [];
  /**
   * Which node each binding of a node layer runs. A WeakMap keyed by the layer, so it cannot
   * outlive a popped layer and there is nothing to clean up in `popLayer`.
   */
  const layerNodes = new WeakMap<KeyLayer, Map<string, CommandNode>>();
  /** push order: the tie-break between siblings, and the default id */
  const seqOf = new WeakMap<KeyLayer, number>();
  let seq = 0;
  const listeners = new Set<() => void>();

  /**
   * Put the stack in law order: base layers first (L2), then each layer by the push order of its
   * owner chain, root first (L3). Computed from ownership at every change rather than kept by
   * inserting in the right place, so the order a host happened to push in never matters.
   */
  function order(): void {
    const byId = new Map(layers.map((l) => [l.id, l]));
    const pathOf = (layer: KeyLayer, seen: Set<KeyLayer>): number[] => {
      const own = seqOf.get(layer) ?? 0;
      const owner = layer.options.parent === undefined ? undefined : byId.get(layer.options.parent);
      if (owner === undefined || seen.has(owner)) return [own];
      seen.add(layer);
      return [...pathOf(owner, seen), own];
    };
    const paths = new Map(layers.map((l) => [l, pathOf(l, new Set())]));
    layers.sort((a, b) => {
      const tier = Number(a.options.base !== true) - Number(b.options.base !== true);
      return tier !== 0 ? tier : comparePaths(paths.get(a) ?? [], paths.get(b) ?? []);
    });
  }

  function changed(): void {
    for (const fn of listeners) fn();
  }

  function pushLayer(bindings: KeyBindings, layerOptions: KeyLayerOptions = {}): KeyLayer {
    const n = seq++;
    const layer: KeyLayer = {
      id: layerOptions.id ?? `layer-${n}`,
      bindings: canonical(bindings),
      options: layerOptions,
    };
    seqOf.set(layer, n);
    layers.push(layer);
    order();
    changed();
    return layer;
  }

  function pushNodeLayer(
    bindings: KeyBindings,
    layerOptions: KeyLayerOptions,
    nodes: Map<string, CommandNode>,
  ): KeyLayer {
    const layer = pushLayer(bindings, layerOptions);
    layerNodes.set(layer, new Map([...nodes].map(([k, node]) => [canonicalBinding(k), node])));
    return layer;
  }

  return {
    layers,
    pushLayer,
    pushNodeLayer,
    popLayer(layer) {
      const i = layers.indexOf(layer);
      if (i === -1) return;
      layers.splice(i, 1);
      changed();
    },
    registerShortcuts(nodes, driverOptions) {
      // The node is kept BESIDE the binding, not inside the closure: a handler is opaque once
      // registered, and `chordCompletions` has to report what each key runs.
      const bindings: KeyBindings = {};
      for (const [shortcut, node] of nodes) {
        bindings[canonicalBinding(shortcut)] = () => driverOptions.onActivate(node);
      }
      return pushNodeLayer(bindings, { base: true, id: "kernel-shortcuts" }, nodes);
    },
    nodesFor(layer) {
      return layerNodes.get(layer);
    },
    isBindingRegistered(pattern, excludeLayerId) {
      // compared in the dispatcher's own dialect, so `cmd+k`, `mod+k` and (off a Mac) `ctrl+k`
      // are the one physical chord they are
      const wanted = canonicalBinding(pattern);
      return layers.some(
        (layer) =>
          isLive(layer) &&
          layer.id !== excludeLayerId &&
          Object.keys(layer.bindings).some((k) => canonicalBinding(k) === wanted),
      );
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
