/**
 * The layer stack for the keyboard driver (keyboard.ts): the ordered layers of bindings, plus
 * which node each binding runs when it came from a node list. Owns no chord state and does no
 * dispatch - `keyboard-dispatch.ts` walks `layers` to decide what a keystroke does. The ORDER is
 * the whole contract, and docs/keyboard.md states it as laws L1-L3 and L17.
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
  /** run `fn` as ONE change: one re-sort and one notification at the end, however many updates */
  batch(fn: () => void): void;
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
    const c = canonicalBinding(k);
    const other = spelled.get(c);
    if (other !== undefined) {
      throw new Error(`keyboard: ${c} is bound twice in one layer ("${other}" and "${k}")`);
    }
    spelled.set(c, k);
    const handler = bindings[k];
    if (handler) out[c] = handler;
  }
  return out;
}

const canonicalNodes = (nodes: Map<string, CommandNode>) =>
  new Map([...nodes].map(([k, node]) => [canonicalBinding(k), node]));

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
  /** where each layer sorted last time: an orphan keeps it when its owner is popped (L3) */
  const lastPath = new WeakMap<KeyLayer, number[]>();
  let seq = 0;
  let ids = 0;
  let version = 0;
  let batching = 0;
  let dirty = false;
  const listeners = new Set<() => void>();

  /**
   * Put the stack in law order: by tier (L2), then each layer by the push order of its owner
   * chain, root first (L3). A layer's tier is at least its owner's, so a base layer a dialog owns
   * sits above that dialog. Computed from ownership at every change, so the order a host happened
   * to push in never matters; a layer whose owner is gone keeps the place it last had.
   */
  function order(): void {
    const byId = new Map(layers.map((l) => [l.id, l]));
    const ownTier = (l: KeyLayer) => tierOf.get(l) ?? (l.options.base === true ? 1 : 2);
    const resolve = (layer: KeyLayer, seen: Set<KeyLayer>): { tier: number; path: number[] } => {
      const own = seqOf.get(layer) ?? 0;
      const id = layer.options.parent;
      const owner = id === undefined ? undefined : byId.get(id);
      if (owner === undefined || seen.has(owner)) {
        const kept = id === undefined ? undefined : lastPath.get(layer);
        return { tier: ownTier(layer), path: kept ?? [own] };
      }
      seen.add(layer);
      const up = resolve(owner, seen);
      return { tier: Math.max(up.tier, ownTier(layer)), path: [...up.path, own] };
    };
    const at = new Map(layers.map((l) => [l, resolve(l, new Set())]));
    for (const [l, { path }] of at) lastPath.set(l, path);
    const tierAt = (l: KeyLayer) => at.get(l)?.tier ?? 2;
    layers.sort(
      (a, b) => tierAt(a) - tierAt(b) || comparePaths(at.get(a)?.path ?? [], at.get(b)?.path ?? []),
    );
  }

  function changed(): void {
    if (batching > 0) {
      dirty = true;
      return;
    }
    order();
    version++;
    for (const fn of listeners) fn();
  }

  /** push, with everything about the layer settled BEFORE anyone is told (L16) */
  function insert(
    bindings: KeyBindings,
    layerOptions: KeyLayerOptions,
    extra: { nodes?: Map<string, CommandNode>; tier?: number } = {},
  ): KeyLayer {
    const n = seq++;
    const id = layerOptions.id ?? `layer-${n}`;
    // an id names ONE layer: a child's `parent` must not be able to mean two
    if (layers.some((l) => l.id === id)) {
      throw new Error(`keyboard: a layer "${id}" is already on the stack`);
    }
    const layer: KeyLayer = { id, bindings: canonical(bindings), options: layerOptions };
    seqOf.set(layer, n);
    if (extra.nodes) layerNodes.set(layer, canonicalNodes(extra.nodes));
    if (extra.tier !== undefined) tierOf.set(layer, extra.tier);
    layers.push(layer);
    changed();
    return layer;
  }

  function updateLayer(layer: KeyLayer, update: LayerUpdate): void {
    if (!layers.includes(layer)) return;
    if (update.bindings) layer.bindings = canonical(update.bindings);
    if (update.options) {
      const next: Record<string, unknown> = { ...layer.options, ...update.options, id: layer.id };
      // `undefined` clears an option (a layer that no longer has an owner)
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      layer.options = next as KeyLayerOptions;
    }
    changed();
  }

  return {
    layers,
    get version() {
      return version;
    },
    pushLayer: (bindings, layerOptions = {}) => insert(bindings, layerOptions),
    pushNodeLayer: (bindings, layerOptions, nodes) => insert(bindings, layerOptions, { nodes }),
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
      // keys as written, so two spellings of one key throw in `canonical` (L10); the node is kept
      // BESIDE the binding, because `chordCompletions` has to report what each key runs
      const bindings: KeyBindings = {};
      for (const [shortcut, node] of nodes)
        bindings[shortcut] = () => driverOptions.onActivate(node);
      // the lowest tier: a host's flat shortcut map is the fallback under every context scope
      const id = freshId("kernel-shortcuts:");
      return insert(bindings, { base: true, id }, { nodes, tier: 0 });
    },
    nodesFor(layer) {
      return layerNodes.get(layer);
    },
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

  function freshId(prefix: string): string {
    return `${prefix}${ids++}`;
  }
}
