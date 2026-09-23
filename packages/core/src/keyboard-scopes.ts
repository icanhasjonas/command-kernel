/**
 * Context layers for the keyboard driver (keyboard.ts): a node list bound as one layer per
 * SCOPE. A facts scope is live while the host's `activeScopes(ctx)` names it; a mounted scope is
 * live while something open (a dialog, a suggestion list) has it mounted. The same key can then
 * mean the right thing per context - `Escape` discards in the editor and goes back in the thread
 * - and a node that is hidden (`when`) or unavailable (`disabled`) right now lets the key fall
 * through instead of eating it. Every layer here tells the stack whether it would take a key,
 * so a description can foresee those declines (L14).
 */

import { disabledReason, nodeScopes } from "./availability.js";
import { canonicalBinding } from "./keyboard-canonical.js";
import type { LayerStack, NodeLayerExtra } from "./keyboard-layers.js";
import type {
  DeclinedListener,
  KeyBindings,
  KeyLayer,
  ScopeBinding,
  ScopeBindingOptions,
} from "./keyboard-types.js";
import type { CommandNode, Ctx } from "./types.js";

/** Whether `node` would run under `ctx`: visible and not disabled. */
function runnable(node: CommandNode, ctx: Ctx): boolean {
  if (node.when && !node.when(ctx)) return false;
  return disabledReason(node, ctx) === null;
}

/** What `bindScopes` needs of the dispatcher: the current press token, and who declined it. */
export interface PressSource {
  current(): object | null;
  onDeclined(fn: DeclinedListener): () => void;
}

/** A scope's layer, built but not yet on the stack. */
type Built = { bindings: KeyBindings; extra: NodeLayerExtra };

export function bindScopes(
  stack: LayerStack,
  options: ScopeBindingOptions,
  { current, onDeclined }: PressSource,
): ScopeBinding {
  const { scopes, activeScopes, onActivate, onDisabled } = options;
  let nodes = options.nodes;
  const mounted = options.mounted ?? [];
  /** the first disabled node this press met, top layer first: what to say if nothing runs */
  let disabled: { press: object; node: CommandNode; reason: string } | null = null;

  // One ctx per press (or per description). Every live-layer check and every handler of one
  // keydown asks for it, and building it may read the DOM; the token is new for every press and
  // every description, so nothing is ever read from an earlier one. Outside both, it is built
  // fresh on each call.
  const cache = new WeakMap<object, Ctx>();
  const ctx = (): Ctx => {
    const press = current();
    if (press === null) return options.ctx();
    let c = cache.get(press);
    if (c === undefined) {
      c = options.ctx();
      cache.set(press, c);
    }
    return c;
  };

  const declared = [...scopes, ...mounted];
  const both = scopes.filter((s) => mounted.includes(s));
  if (both.length > 0) {
    throw new Error(`bindScopes: scope(s) both facts and mounted: ${both.join(", ")}`);
  }
  const check = (list: readonly CommandNode[]) => {
    const unknown = list.flatMap((n) =>
      n.shortcut ? nodeScopes(n).filter((s) => !declared.includes(s)) : [],
    );
    if (unknown.length > 0) {
      throw new Error(`bindScopes: scope(s) not declared: ${[...new Set(unknown)].join(", ")}`);
    }
  };

  /** a scope's layer from `list`: per key, its nodes in list order; the first runnable one runs */
  function build(scope: string, list: readonly CommandNode[]): Built {
    const byKey = new Map<string, CommandNode[]>();
    for (const node of list) {
      if (!node.shortcut || !nodeScopes(node).includes(scope)) continue;
      const key = canonicalBinding(node.shortcut);
      byKey.set(key, [...(byKey.get(key) ?? []), node]);
    }
    const bindings: KeyBindings = {};
    const first = new Map<string, CommandNode>();
    for (const [key, candidates] of byKey) {
      const [head] = candidates;
      if (head) first.set(key, head);
      bindings[key] = () => {
        const c = ctx();
        const node = candidates.find((n) => runnable(n, c));
        if (node) {
          onActivate(node, c);
          return true;
        }
        const press = current();
        if (press !== null && disabled?.press !== press) {
          // hidden nodes (`when`) are not here at all; only a disabled one has a reason
          const off = candidates.find((n) => !n.when || n.when(c));
          const reason = off ? disabledReason(off, c) : null;
          if (off && reason !== null) disabled = { press, node: off, reason };
        }
        return false;
      };
    }
    const accepts = (key: string) => {
      const c = ctx();
      return (byKey.get(key) ?? []).some((n) => runnable(n, c));
    };
    return { bindings, extra: { nodes: first, accepts } };
  }

  // Build everything first, then push it all as ONE change: a node that cannot bind throws
  // before anything is on the stack (L12). Facts scopes are BASE layers, and their ids are
  // fresh per binding, so binding the same scopes twice never collides.
  check(nodes);
  const built = scopes.map((scope) => build(scope, nodes));
  const layers: KeyLayer[] = [];
  stack.batch(() => {
    scopes.forEach((scope, i) => {
      const b = built[i];
      if (!b) return;
      const active = () => activeScopes(ctx()).includes(scope);
      const id = stack.freshId(`scope:${scope}:`);
      layers.push(stack.pushNodeLayer(b.bindings, { id, base: true, active }, b.extra));
    });
  });
  let disposed = false;

  /** the mounted layers still up, and the scope each one is, popped on dispose */
  const open = new Map<KeyLayer, string>();
  const prune = () => {
    for (const layer of open.keys()) if (!stack.has(layer)) open.delete(layer);
  };

  // nothing took the press: if one of ours said no, say why (once, the top-most reason)
  const unsubscribe = onDeclined(() => {
    const d = disabled;
    if (d === null || d.press !== current() || !onDisabled) return;
    disabled = null;
    onDisabled(d.node, d.reason, ctx());
  });

  return {
    layers,
    mount(scope, mountOptions = {}) {
      if (disposed) {
        throw new Error(`bindScopes: this binding is disposed; mount "${scope}" on the new one`);
      }
      if (!mounted.includes(scope)) {
        throw new Error(`bindScopes: scope "${scope}" was not declared as mounted`);
      }
      // forget the ones the host already popped, so a dialog opened a thousand times holds none
      prune();
      const { bindings, extra } = build(scope, nodes);
      // unique across the whole stack, not per binding: two bindings mount two distinct layers
      const id = mountOptions.id ?? stack.freshId(`scope:${scope}:`);
      const layer = stack.pushNodeLayer(bindings, { ...mountOptions, id }, extra);
      open.set(layer, scope);
      return layer;
    },
    setNodes(next) {
      // compute everything first: a node that cannot bind throws before anything changes
      check(next);
      prune();
      const facts = scopes.map((scope) => build(scope, next));
      const opened = [...open].map(([layer, scope]) => [layer, build(scope, next)] as const);
      nodes = next;
      // then one change for the whole swap: one re-sort, one notification (L16)
      stack.batch(() => {
        layers.forEach((layer, i) => {
          const b = facts[i];
          if (b) stack.updateNodeLayer(layer, b.bindings, b.extra);
        });
        for (const [layer, b] of opened) stack.updateNodeLayer(layer, b.bindings, b.extra);
      });
    },
    dispose() {
      disposed = true;
      unsubscribe();
      stack.batch(() => {
        for (const layer of [...layers, ...open.keys()]) stack.popLayer(layer);
      });
      open.clear();
    },
  };
}
