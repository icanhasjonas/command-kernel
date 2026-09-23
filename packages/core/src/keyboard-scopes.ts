/**
 * Context layers for the keyboard driver (keyboard.ts): a node list bound as one layer per
 * SCOPE, each live while the host's `activeScopes(ctx)` names it. The same key can then mean the
 * right thing per context - `Escape` discards in the editor and goes back in the thread - and a
 * node that is hidden (`when`) or unavailable (`disabled`) right now lets the key fall through
 * instead of eating it.
 */

import { disabledReason, nodeScopes } from "./availability.js";
import type { LayerStack } from "./keyboard-layers.js";
import { normalizeShortcut } from "./keyboard-normalize.js";
import type { KeyBindings, KeyLayer, ScopeBinding, ScopeBindingOptions } from "./keyboard-types.js";
import { parseShortcut } from "./shortcut.js";
import type { CommandNode, Ctx } from "./types.js";

/** A shortcut in the dispatcher's own dialect, chord steps apart: `G i` -> `g i`. */
export function canonicalBinding(shortcut: string): string {
  return shortcut
    .trim()
    .split(/\s+/)
    .map((step) => normalizeShortcut(parseShortcut(step)))
    .join(" ");
}

/** Whether `node` would run under `ctx`: visible and not disabled. */
function runnable(node: CommandNode, ctx: Ctx): boolean {
  if (node.when && !node.when(ctx)) return false;
  return disabledReason(node, ctx) === null;
}

export function bindScopes(
  stack: LayerStack,
  options: ScopeBindingOptions,
  press: () => number,
): ScopeBinding {
  const { nodes, scopes, activeScopes, onActivate } = options;

  // One ctx per press. Every live-layer check and every handler of one keydown asks for it, and
  // building it may read the DOM (where focus is); `press` counts keydowns, so the next one
  // always builds afresh, however quickly it follows.
  let cached: { press: number; ctx: Ctx } | null = null;
  const ctx = (): Ctx => {
    const now = press();
    if (cached === null || cached.press !== now) cached = { press: now, ctx: options.ctx() };
    return cached.ctx;
  };

  const unknown = nodes.flatMap((n) =>
    n.shortcut ? nodeScopes(n).filter((s) => !scopes.includes(s)) : [],
  );
  if (unknown.length > 0) {
    throw new Error(`bindScopes: scope(s) not declared: ${[...new Set(unknown)].join(", ")}`);
  }

  const layers: KeyLayer[] = scopes.map((scope) => {
    // key -> its nodes in this scope, in list order: the first runnable one takes the press
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
        if (!node) return false;
        onActivate(node, c);
        return true;
      };
    }
    const active = () => activeScopes(ctx()).includes(scope);
    return stack.pushNodeLayer(bindings, { id: `scope:${scope}`, active }, first);
  });

  return {
    layers,
    dispose() {
      for (const layer of layers) stack.popLayer(layer);
    },
  };
}
