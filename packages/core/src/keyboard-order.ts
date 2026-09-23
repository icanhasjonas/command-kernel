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

/** The order key of one layer (see `order`). */
export interface SortKey {
  tier: number;
  /** the stamp of its window (nearest modal owner-or-self); -1 for the screen */
  frame: number;
  frameDepth: number;
  /** 0 the window's own modal layer, 1 what it holds */
  rank: number;
  stamp: number;
  depth: number;
  seq: number;
}

/** Everything the stack knows about one live layer. Deleted with it. */
export interface Place {
  seq: number;
  /** 0 the registered shortcut map, 1 base layers (facts scopes among them), 2 everything else */
  own: number;
  /** where it sorted last: kept by a layer whose owner is gone */
  key?: SortKey;
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
 *    owner's (ownership beats base);
 * 2. MODAL LAYERS ARE WINDOWS: every layer belongs to its nearest modal owner-or-self (or to the
 *    screen, below every window). The window opened last is on top, and a layer never rises
 *    above a window that is not its own: suggestions that open late in the editor stay under a
 *    palette opened in the meantime, and a toast shown while a dialog is open stays under it;
 * 3. in a window, its modal layer first, then the layer OPENED LAST on top: each layer is stamped
 *    with the later of its own push and its owner's stamp, so it is above its owner;
 * 4. an owner and a child pushed before it (React runs child effects first) tie on the stamp:
 *    the deeper one is on top; then push order.
 * A layer whose owner is gone keeps the key it last had. Recomputed at every change, so the
 * order a host happened to push in never matters.
 */
export function order(layers: KeyLayer[], places: Map<KeyLayer, Place>): void {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const done = new Map<KeyLayer, SortKey>();
  const resolve = (layer: KeyLayer, seen: Set<KeyLayer>): SortKey => {
    const known = done.get(layer);
    if (known) return known;
    const p = places.get(layer);
    const seq = p?.seq ?? 0;
    const own = p?.own ?? 2;
    const modal = layer.options.modal === true;
    const id = layer.options.parent;
    const owner = id === undefined ? undefined : byId.get(id);
    let key: SortKey;
    if (owner === undefined || seen.has(owner)) {
      if (id !== undefined && p?.key) key = p.key;
      else key = root(own, seq, modal);
    } else {
      seen.add(layer);
      const up = resolve(owner, seen);
      const stamp = Math.max(up.stamp, seq);
      const depth = up.depth + 1;
      key = {
        tier: Math.max(up.tier, own),
        frame: modal ? stamp : up.frame,
        frameDepth: modal ? depth : up.frameDepth,
        rank: modal ? 0 : 1,
        stamp,
        depth,
        seq,
      };
    }
    done.set(layer, key);
    return key;
  };
  for (const l of layers) {
    const k = resolve(l, new Set());
    const p = places.get(l);
    if (p) p.key = k;
  }
  const at = (l: KeyLayer) => done.get(l) ?? root(2, 0, false);
  layers.sort((a, b) => {
    const x = at(a);
    const y = at(b);
    return (
      x.tier - y.tier ||
      x.frame - y.frame ||
      x.frameDepth - y.frameDepth ||
      x.rank - y.rank ||
      x.stamp - y.stamp ||
      x.depth - y.depth ||
      x.seq - y.seq
    );
  });
}

/** Where a layer with no owner on the stack sorts: its own window if modal, else the screen. */
function root(tier: number, seq: number, modal: boolean): SortKey {
  return {
    tier,
    frame: modal ? seq : -1,
    frameDepth: modal ? 0 : -1,
    rank: modal ? 0 : 1,
    stamp: seq,
    depth: 0,
    seq,
  };
}
