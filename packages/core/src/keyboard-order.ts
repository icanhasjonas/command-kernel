/**
 * The ORDER of the keyboard's layer stack (laws L2, L3), and the canonical forms a layer is
 * stored in (L6, L10). Pure: `keyboard-layers.ts` owns the stack and calls these.
 */

import { canonicalBinding } from "./keyboard-canonical.js";
import type { Accepts } from "./keyboard-layers.js";
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

/** Lexicographic, a prefix first: an owner sorts below everything it owns. */
function comparePaths(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

/** Everything the stack knows about one live layer. Deleted with it. */
export interface Place {
  seq: number;
  /** 0 the registered shortcut map, 1 base layers (facts scopes among them), 2 everything else */
  own: number;
  /** where it sorted last: its tier (at least its owner's) and its owner chain's push order */
  tier: number;
  path: number[];
  nodes?: Map<string, CommandNode>;
  accepts?: Accepts;
}

/**
 * Put the stack in law order: by tier (L2), then by the push order of each layer's owner chain,
 * root first (L3). A layer's tier is at least its owner's (ownership beats base). A layer whose
 * owner is gone keeps the tier and place it last had. Computed from ownership at every change,
 * so the order a host happened to push in never matters.
 */
export function order(layers: KeyLayer[], places: Map<KeyLayer, Place>): void {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const resolve = (layer: KeyLayer, seen: Set<KeyLayer>): { tier: number; path: number[] } => {
    const p = places.get(layer);
    const own = p?.seq ?? 0;
    const id = layer.options.parent;
    const owner = id === undefined ? undefined : byId.get(id);
    if (owner === undefined || seen.has(owner)) {
      if (id !== undefined && p && p.path.length > 0) return { tier: p.tier, path: p.path };
      return { tier: p?.own ?? 2, path: [own] };
    }
    seen.add(layer);
    const up = resolve(owner, seen);
    return { tier: Math.max(up.tier, p?.own ?? 2), path: [...up.path, own] };
  };
  const at = new Map(layers.map((l) => [l, resolve(l, new Set())]));
  for (const [l, where] of at) {
    const p = places.get(l);
    if (p) Object.assign(p, where);
  }
  const key = (l: KeyLayer) => at.get(l) ?? { tier: 2, path: [] };
  layers.sort((a, b) => key(a).tier - key(b).tier || comparePaths(key(a).path, key(b).path));
}
