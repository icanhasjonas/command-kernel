/**
 * The layer stack for the keyboard driver (keyboard.ts): the ordered layers of bindings, and what
 * the stack knows about each (its place, the nodes its bindings run, whether it would take a key).
 * Owns no chord state and does no dispatch - `keyboard-dispatch.ts` walks `layers`. The ORDER is
 * the whole contract, and docs/keyboard.md states it as laws L1-L3 and L17.
 */

import { canonicalBinding } from "./keyboard-canonical.js";
import { canonical, canonicalNodes, order, type Place, settle } from "./keyboard-order.js";
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
  return layer.options.modal !== true || (layer.options.passThrough ?? []).includes(binding);
}

/** Whether a node layer would take `binding` right now, or decline it (`when`, `disabled`). */
export type Accepts = (binding: string) => boolean;

/** What a node layer carries besides its bindings. */
export interface NodeLayerExtra {
  nodes: Map<string, CommandNode>;
  accepts?: Accepts;
}

export interface LayerStack {
  /** the live stack, bottom first - re-sorted in place, so this reference stays valid */
  readonly layers: readonly KeyLayer[];
  /** counts every push, pop and update (L16) */
  readonly version: number;
  has(layer: KeyLayer): boolean;
  pushLayer(bindings: KeyBindings, options?: KeyLayerOptions): KeyLayer;
  popLayer(layer: KeyLayer): void;
  /** new bindings and/or options for a live layer, in place: it keeps its position (L17) */
  updateLayer(layer: KeyLayer, update: LayerUpdate): void;
  /** bind a Map of shortcut strings -> nodes as the lowest layer of all */
  registerShortcuts(nodes: Map<string, CommandNode>, options: ShortcutDriverOptions): KeyLayer;
  /** push a layer whose bindings each run a known node */
  pushNodeLayer(bindings: KeyBindings, options: KeyLayerOptions, extra: NodeLayerExtra): KeyLayer;
  /** `updateLayer` for a node layer: its bindings and the nodes they run, together */
  updateNodeLayer(layer: KeyLayer, bindings: KeyBindings, extra: NodeLayerExtra): void;
  /** which node a binding of `layer` runs, or undefined for a plain `pushLayer` */
  nodesFor(layer: KeyLayer): Map<string, CommandNode> | undefined;
  /** whether `layer` would take `binding` now; plain layers are assumed to (their handlers are opaque) */
  accepts(layer: KeyLayer, binding: string): boolean;
  /** an id no layer on this stack has had: `${prefix}${n}` */
  freshId(prefix: string): string;
  /** run `fn` as ONE change: one re-sort and one notification at the end, however many updates */
  batch(fn: () => void): void;
  /** tell subscribers something about the stack changed that is not a push, pop or update */
  touch(): void;
  isBindingRegistered(pattern: string, excludeLayerId?: string): boolean;
  subscribe(fn: () => void): () => void;
}

export function createLayerStack(): LayerStack {
  const layers: KeyLayer[] = [];
  const places = new Map<KeyLayer, Place>();
  let seq = 0;
  let ids = 0;
  let version = 0;
  let batching = 0;
  let dirty = false;
  const listeners = new Set<() => void>();

  function changed(): void {
    if (batching > 0) {
      dirty = true;
      return;
    }
    order(layers, places);
    version++;
    for (const fn of listeners) fn();
  }

  function freshId(prefix: string): string {
    return `${prefix}${ids++}`;
  }

  /** push, with everything about the layer settled BEFORE anyone is told (L16) */
  function insert(
    bindings: KeyBindings,
    layerOptions: KeyLayerOptions,
    extra: { tier?: number; node?: NodeLayerExtra } = {},
  ): KeyLayer {
    const n = seq++;
    let id = layerOptions.id;
    // a default id skips any a host took by hand, so it can never collide
    while (id === undefined || (layerOptions.id === undefined && byIdTaken(id))) {
      id = `layer-${ids++}`;
    }
    // an id names ONE layer: a child's `parent` must not be able to mean two
    if (byIdTaken(id)) throw new Error(`keyboard: a layer "${id}" is already on the stack`);
    const layer: KeyLayer = { id, bindings: canonical(bindings), options: settle(layerOptions) };
    const own = extra.tier ?? (layerOptions.base === true ? 1 : 2);
    const place: Place = { seq: n, own, tier: own, path: [] };
    if (extra.node) {
      place.nodes = canonicalNodes(extra.node.nodes);
      if (extra.node.accepts) place.accepts = extra.node.accepts;
    }
    places.set(layer, place);
    layers.push(layer);
    changed();
    return layer;
  }

  function byIdTaken(id: string): boolean {
    return layers.some((l) => l.id === id);
  }

  function updateLayer(layer: KeyLayer, update: LayerUpdate, node?: NodeLayerExtra): void {
    const place = places.get(layer);
    if (!place) return;
    if (update.bindings) {
      layer.bindings = canonical(update.bindings);
      // new bindings are not the old nodes' any more, unless the caller says whose they are
      delete place.nodes;
      delete place.accepts;
      if (node) {
        place.nodes = canonicalNodes(node.nodes);
        if (node.accepts) place.accepts = node.accepts;
      }
    }
    if (update.options) {
      const next: Record<string, unknown> = { ...layer.options, ...update.options, id: layer.id };
      // `undefined` clears an option (a layer that no longer has an owner)
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      layer.options = settle(next as KeyLayerOptions);
    }
    changed();
  }

  return {
    layers,
    get version() {
      return version;
    },
    has: (layer) => places.has(layer),
    pushLayer: (bindings, layerOptions = {}) => insert(bindings, layerOptions),
    pushNodeLayer: (bindings, layerOptions, node) => insert(bindings, layerOptions, { node }),
    updateLayer: (layer, update) => updateLayer(layer, update),
    updateNodeLayer: (layer, bindings, node) => updateLayer(layer, { bindings }, node),
    popLayer(layer) {
      const i = layers.indexOf(layer);
      if (i === -1) return;
      layers.splice(i, 1);
      places.delete(layer);
      changed();
    },
    registerShortcuts(nodes, driverOptions) {
      // keys as written, so two spellings of one key throw in `canonical` (L10); the node is kept
      // BESIDE the binding, because a description has to say what each key runs
      const bindings: KeyBindings = {};
      for (const [shortcut, node] of nodes)
        bindings[shortcut] = () => driverOptions.onActivate(node);
      // the lowest tier: a host's flat shortcut map is the fallback under every context scope
      const id = freshId("kernel-shortcuts:");
      return insert(bindings, { base: true, id }, { tier: 0, node: { nodes } });
    },
    nodesFor: (layer) => places.get(layer)?.nodes,
    accepts: (layer, binding) => places.get(layer)?.accepts?.(binding) ?? true,
    freshId,
    batch(fn) {
      batching++;
      try {
        fn();
      } finally {
        batching--;
        if (batching === 0 && dirty) {
          dirty = false;
          changed();
        }
      }
    },
    touch: changed,
    isBindingRegistered(pattern, excludeLayerId) {
      // compared in the dispatcher's own dialect, so `cmd+k`, `mod+k` and (off a Mac) `ctrl+k`
      // are the one physical chord they are
      const wanted = canonicalBinding(pattern);
      return layers.some(
        (layer) => isLive(layer) && layer.id !== excludeLayerId && wanted in layer.bindings,
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
