/**
 * The ORDER of the keyboard's layer stack (laws L2, L3), and the canonical forms a layer is
 * stored in (L6, L10). Pure: `keyboard-layers.ts` owns the stack and calls these.
 */

import { canonicalBinding } from "./keyboard-canonical.js";
import type { KeyBindings, KeyLayer, KeyLayerOptions } from "./keyboard-types.js";
import type { CommandNode } from "./types.js";

/**
 * A copy of `bindings` with every key canonical (law L10). Two spellings of one key (`Escape`
 * and `esc`) throw, rather than one of them silently winning. Always a copy: a host that keeps
 * the object it passed in cannot change the layer behind the stack's back.
 */
export function canonical(bindings: KeyBindings): KeyBindings {
  const out: KeyBindings = {};
  const spelled = new Map<string, string>();
  for (const [k, handler] of Object.entries(bindings)) {
    const c = canonicalBinding(k);
    const other = spelled.get(c);
    if (other !== undefined) {
      throw new Error(`keyboard: ${c} is bound twice in one layer ("${other}" and "${k}")`);
    }
    spelled.set(c, k);
    out[c] = handler;
  }
  return out;
}

/** options with `passThrough` made canonical, so an unknown key name throws when pushed (L6) */
export function settle(options: KeyLayerOptions): KeyLayerOptions {
  if (options.passThrough === undefined) return { ...options };
  return { ...options, passThrough: options.passThrough.map(canonicalBinding) };
}

export const canonicalNodes = (nodes: Map<string, CommandNode>) =>
  new Map([...nodes].map(([k, node]) => [canonicalBinding(k), node]));

/** Whether a node layer would take `binding` right now (or, for a chord, show it at all). */
export type Accepts = (binding: string) => boolean;

/** Everything the stack knows about one live layer. Deleted with it. */
export interface Place {
  seq: number;
  /** 0 the registered shortcut map, 1 base layers (facts scopes among them), 2 everything else */
  own: number;
  /** where it sorted last: tier (at least its owner's), when its subtree last opened, depth */
  tier: number;
  stamp: number;
  depth: number;
  /** false until the layer has sorted once */
  placed: boolean;
  /** its tier is set by the stack (the registered map), not by `base` */
  fixed?: boolean;
  nodes?: Map<string, CommandNode>;
  /** would its command RUN (not hidden, not disabled): a key a press lands on */
  accepts?: Accepts;
  /** would its command SHOW (not hidden): a chord step that arms */
  visible?: Accepts;
}

/**
 * Put the stack in law order (L2, L3):
 * 1. by tier: the registered map, then base layers, then the rest; a layer's tier is at least its
 *    owner's, so a base layer a dialog owns sits above that dialog (ownership beats base);
 * 2. then the layer OPENED LAST is on top: each layer is stamped with the later of its own push
 *    and its owner's stamp, so it is above its owner and above anything opened before it, even a
 *    root toast that appeared after its owner did;
 * 3. an owner and what it owns tie on the stamp when the child was pushed first (React runs child
 *    effects before the parent's): the deeper one is on top; then push order.
 * A layer whose owner is gone keeps the tier, stamp and depth it last had. Recomputed at every
 * change, so the order a host happened to push in never matters.
 */
export function order(layers: KeyLayer[], places: Map<KeyLayer, Place>): void {
  const byId = new Map(layers.map((l) => [l.id, l]));
  type Key = { tier: number; stamp: number; depth: number; seq: number };
  const done = new Map<KeyLayer, Key>();
  const resolve = (layer: KeyLayer, seen: Set<KeyLayer>): Key => {
    const known = done.get(layer);
    if (known) return known;
    const p = places.get(layer);
    const seq = p?.seq ?? 0;
    const own = p?.own ?? 2;
    const id = layer.options.parent;
    const owner = id === undefined ? undefined : byId.get(id);
    let key: Key;
    if (owner === undefined || seen.has(owner)) {
      key =
        id !== undefined && p?.placed
          ? { tier: p.tier, stamp: p.stamp, depth: p.depth, seq }
          : { tier: own, stamp: seq, depth: 0, seq };
    } else {
      seen.add(layer);
      const up = resolve(owner, seen);
      key = {
        tier: Math.max(up.tier, own),
        stamp: Math.max(up.stamp, seq),
        depth: up.depth + 1,
        seq,
      };
    }
    done.set(layer, key);
    return key;
  };
  for (const l of layers) {
    const k = resolve(l, new Set());
    const p = places.get(l);
    if (p) Object.assign(p, { tier: k.tier, stamp: k.stamp, depth: k.depth, placed: true });
  }
  const key = (l: KeyLayer) => done.get(l) ?? { tier: 2, stamp: 0, depth: 0, seq: 0 };
  layers.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x.tier - y.tier || x.stamp - y.stamp || x.depth - y.depth || x.seq - y.seq;
  });
}
