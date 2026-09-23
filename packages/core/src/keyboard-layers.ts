/**
 * The layer stack for the keyboard driver (keyboard.ts): the ordered layers of bindings, plus
 * which node each binding runs when it came from a node list. Owns no chord state and does no
 * dispatch - `keyboard-dispatch.ts` reads `layers` (and `nodesFor`) to decide what a keystroke
 * does. The ORDER is the whole contract, and docs/keyboard.md states it as laws L1-L3 and L17.
 */

import { canonicalBinding } from "./keyboard-normalize.js";
import type {
  KeyBindings,
  KeyLayer,
  KeyLayerOptions,
  LayerUpdate,
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
  /** counts every push, pop and update (L16) */
  readonly version: number;
  pushLayer(bindings: KeyBindings, options?: KeyLayerOptions): KeyLayer;
  popLayer(layer: KeyLayer): void;
  /** new bindings and/or options for a live layer, in place: it keeps its position (L17) */
  updateLayer(layer: KeyLayer, update: LayerUpdate): void;
  /** bind a Map of shortcut strings -> nodes as the lowest layer of all */
  registerShortcuts(nodes: Map<string, CommandNode>, options: ShortcutDriverOptions): KeyLayer;
  /** push a layer whose bindings each run a known node (recorded for `chordCompletions`) */
  pushNodeLayer(
    bindings: KeyBindings,
    options: KeyLayerOptions,
    nodes: Map<string, CommandNode>,
  ): KeyLayer;
  /** `updateLayer` for a node layer: its bindings and the nodes they run, together */
  updateNodeLayer(layer: KeyLayer, bindings: KeyBindings, nodes: Map<string, CommandNode>): void;
  /** which node a binding of `layer` runs, or undefined for a plain `pushLayer` */
  nodesFor(layer: KeyLayer): Map<string, CommandNode> | undefined;
  /** an id no layer on this stack has had: `${prefix}${n}` */
  freshId(prefix: string): string;
  isBindingRegistered(pattern: string, excludeLayerId?: string): boolean;
  subscribe(fn: () => void): () => void;
}

/**
 * `bindings` with every key canonical (law L10); the same object when they already were. Two
 * spellings of one key (`Escape` and `esc`) throw, rather than one of them silently winning.
 */
function canonical(bindings: KeyBindings): KeyBindings {
  const keys = Object.keys(bindings);
  if (keys.every((k) => canonicalBinding(k) === k)) return bindings;
  const out: KeyBindings = {};
  const spelled = new Map<string, string>();
  for (const k of keys) {
    const handler = bindings[k];
    const c = canonicalBinding(k);
    const other = spelled.get(c);
    if (other !== undefined) {
      throw new Error(`keyboard: ${c} is bound twice in one layer ("${other}" and "${k}")`);
    }
    spelled.set(c, k);
    if (handler) out[c] = handler;
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
  /** which node each binding of a node layer runs; a WeakMap, so a popped layer takes it along */
  const layerNodes = new WeakMap<KeyLayer, Map<string, CommandNode>>();
  /** push order: the tie-break between siblings, and the default id */
  const seqOf = new WeakMap<KeyLayer, number>();
  /** 0 the registered shortcut map, 1 base layers (facts scopes among them), 2 everything else */
  const tierOf = new WeakMap<KeyLayer, number>();
  const tier = (l: KeyLayer) => tierOf.get(l) ?? (l.options.base === true ? 1 : 2);
  let seq = 0;
  let ids = 0;
  let version = 0;
  const listeners = new Set<() => void>();

  /**
   * Put the stack in law order: by tier (L2), then each layer by the push order of its owner
   * chain, root first (L3). Computed from ownership at every change rather than kept by inserting
   * in the right place, so the order a host happened to push in never matters.
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
    layers.sort(
      (a, b) => tier(a) - tier(b) || comparePaths(paths.get(a) ?? [], paths.get(b) ?? []),
    );
  }

  function changed(): void {
    version++;
    for (const fn of listeners) fn();
  }

  function pushLayer(bindings: KeyBindings, layerOptions: KeyLayerOptions = {}): KeyLayer {
    const n = seq++;
    const id = layerOptions.id ?? `layer-${n}`;
    // an id names ONE layer: a child's `parent` must not be able to mean two
    if (layers.some((l) => l.id === id)) {
      throw new Error(`keyboard: a layer "${id}" is already on the stack`);
    }
    const layer: KeyLayer = { id, bindings: canonical(bindings), options: layerOptions };
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
    layerNodes.set(layer, canonicalNodes(nodes));
    return layer;
  }

  function updateLayer(layer: KeyLayer, update: LayerUpdate): void {
    if (!layers.includes(layer)) return;
    if (update.bindings) layer.bindings = canonical(update.bindings);
    if (update.options) layer.options = { ...layer.options, ...update.options, id: layer.id };
    order();
    changed();
  }

  return {
    layers,
    get version() {
      return version;
    },
    pushLayer,
    pushNodeLayer,
    updateLayer,
    updateNodeLayer(layer, bindings, nodes) {
      if (!layers.includes(layer)) return;
      layerNodes.set(layer, canonicalNodes(nodes));
      updateLayer(layer, { bindings });
    },
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
      // the lowest tier: a host's flat shortcut map is the fallback under every context scope
      const layer = pushNodeLayer(bindings, { base: true, id: "kernel-shortcuts" }, nodes);
      tierOf.set(layer, 0);
      order();
      return layer;
    },
    nodesFor(layer) {
      return layerNodes.get(layer);
    },
    freshId(prefix) {
      return `${prefix}${ids++}`;
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

function canonicalNodes(nodes: Map<string, CommandNode>): Map<string, CommandNode> {
  return new Map([...nodes].map(([k, node]) => [canonicalBinding(k), node]));
}
