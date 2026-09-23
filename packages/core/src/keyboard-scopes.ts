/**
 * Context layers for the keyboard driver (keyboard.ts): a node list bound as one layer per
 * SCOPE. A facts scope is live while the host's `activeScopes(ctx)` names it; a mounted scope is
 * live while something open (a dialog, a suggestion list) has it mounted. The same key can then
 * mean the right thing per context - `Escape` discards in the editor and goes back in the thread
 * - and a node that is hidden (`when`) or unavailable (`disabled`) right now lets the key fall
 * through instead of eating it.
 */

import { disabledReason, nodeScopes } from "./availability.js";
import type { LayerStack } from "./keyboard-layers.js";
import { canonicalBinding } from "./keyboard-normalize.js";
import type {
  DeclinedListener,
  KeyBindings,
  KeyLayer,
  ScopeBinding,
  ScopeBindingOptions,
} from "./keyboard-types.js";
import type { CommandNode, Ctx } from "./types.js";

export { canonicalBinding };

/** Whether `node` would run under `ctx`: visible and not disabled. */
function runnable(node: CommandNode, ctx: Ctx): boolean {
  if (node.when && !node.when(ctx)) return false;
  return disabledReason(node, ctx) === null;
}

/** What `bindScopes` needs of the dispatcher: which press this is, and who declined it. */
export interface PressSource {
  press(): number;
  pressing(): boolean;
  onDeclined(fn: DeclinedListener): () => void;
}

export function bindScopes(
  stack: LayerStack,
  options: ScopeBindingOptions,
  { press, pressing, onDeclined }: PressSource,
): ScopeBinding {
  const { scopes, activeScopes, onActivate, onDisabled } = options;
  let nodes = options.nodes;
  const mounted = options.mounted ?? [];
  /** the first disabled node this press met, top layer first: what to say if nothing runs */
  let disabled: { press: number; node: CommandNode; reason: string } | null = null;

  // One ctx per press. Every live-layer check and every handler of one keydown asks for it, and
  // building it may read the DOM (where focus is); `press` counts keydowns, so the next one
  // always builds afresh, however quickly it follows. OUTSIDE a press (describeStack, a hint
  // rendering) there is nothing to share, and a cached ctx would be the last press's facts.
  let cached: { press: number; ctx: Ctx } | null = null;
  const ctx = (): Ctx => {
    if (!pressing()) return options.ctx();
    const now = press();
    if (cached === null || cached.press !== now) cached = { press: now, ctx: options.ctx() };
    return cached.ctx;
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
  check(nodes);

  /** a scope's bindings: per key, its nodes in list order; the first runnable one takes it */
  function bindingsFor(scope: string): { bindings: KeyBindings; first: Map<string, CommandNode> } {
    const byKey = new Map<string, CommandNode[]>();
    for (const node of nodes) {
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
        if (!node) {
          const now = press();
          if (disabled?.press !== now) {
            // hidden nodes (`when`) are not here at all; only a disabled one has a reason
            const off = candidates.find((n) => !n.when || n.when(c));
            const reason = off ? disabledReason(off, c) : null;
            if (off && reason !== null) disabled = { press: now, node: off, reason };
          }
          return false;
        }
        onActivate(node, c);
        return true;
      };
    }
    return { bindings, first };
  }

  // Facts scopes are BASE layers (law L12): the app's context, so a rebind (the node list
  // changed while a dialog was open) lands under every overlay instead of on top of it.
  const layers: KeyLayer[] = scopes.map((scope) => {
    const { bindings, first } = bindingsFor(scope);
    const active = () => activeScopes(ctx()).includes(scope);
    return stack.pushNodeLayer(bindings, { id: `scope:${scope}`, base: true, active }, first);
  });

  /** the mounted layers still up, and the scope each one is, popped on dispose */
  const open = new Map<KeyLayer, string>();
  const prune = () => {
    for (const layer of open.keys()) if (!stack.layers.includes(layer)) open.delete(layer);
  };

  // nothing took the press: if one of ours said no, say why (once, the top-most reason)
  const unsubscribe = onDeclined(() => {
    const d = disabled;
    if (d === null || d.press !== press() || !onDisabled) return;
    disabled = null;
    onDisabled(d.node, d.reason, ctx());
  });

  return {
    layers,
    mount(scope, mountOptions = {}) {
      if (!mounted.includes(scope)) {
        throw new Error(`bindScopes: scope "${scope}" was not declared as mounted`);
      }
      // forget the ones the host already popped, so a dialog opened a thousand times holds none
      prune();
      const { bindings, first } = bindingsFor(scope);
      // unique across the whole stack, not per binding: two bindings mount two distinct layers
      const id = mountOptions.id ?? stack.freshId(`scope:${scope}:`);
      const layer = stack.pushNodeLayer(bindings, { ...mountOptions, id }, first);
      open.set(layer, scope);
      return layer;
    },
    setNodes(next) {
      check(next);
      nodes = next;
      prune();
      scopes.forEach((scope, i) => {
        const layer = layers[i];
        if (!layer) return;
        const { bindings, first } = bindingsFor(scope);
        stack.updateNodeLayer(layer, bindings, first);
      });
      for (const [layer, scope] of open) {
        const { bindings, first } = bindingsFor(scope);
        stack.updateNodeLayer(layer, bindings, first);
      }
    },
    dispose() {
      unsubscribe();
      for (const layer of [...layers, ...open.keys()]) stack.popLayer(layer);
      open.clear();
    },
  };
}
