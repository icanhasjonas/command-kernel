import type { Keyboard, ScopeBinding, ScopeBindingOptions } from "@command-kernel/core";
import { useLayoutEffect, useMemo, useRef } from "react";

/**
 * The app's scope binding, owned by a component. It is CREATED during render
 * (`keyboard.createScopes`, which pushes nothing, so StrictMode may make two and keep one) and
 * ATTACHED in a layout effect, which puts the facts scopes on the stack. So it exists on the very
 * first render: a `KeyboardScope` mounts in tree order, never late. New `nodes` go through
 * `setNodes`, in place (L12), and only when the array is a different one: memoize it. A new set
 * of `scopes` or `mounted` names is a new binding (its open scopes re-open). `ctx`,
 * `activeScopes`, `onActivate` and `onDisabled` are read fresh on every press, so they may be
 * new functions on every render.
 */
export function useScopeBinding(keyboard: Keyboard, options: ScopeBindingOptions): ScopeBinding {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const scopes = options.scopes.join("\n");
  const mounted = (options.mounted ?? []).join("\n");
  const created = useRef<{ binding: ScopeBinding | null; nodes: unknown }>({
    binding: null,
    nodes: null,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `scopes` and `mounted` are the joined names; a new set of names is a new binding, a new array with the same names is not
  const binding = useMemo(() => {
    const o = options;
    const b = keyboard.createScopes({
      nodes: o.nodes,
      scopes: o.scopes,
      ...(o.mounted ? { mounted: o.mounted } : {}),
      ctx: () => latest.current.ctx(),
      activeScopes: (c) => latest.current.activeScopes(c),
      onActivate: (n, c) => latest.current.onActivate(n, c),
      onDisabled: (n, reason, c) => latest.current.onDisabled?.(n, reason, c),
    });
    return b;
  }, [keyboard, scopes, mounted]);

  useLayoutEffect(() => {
    binding.attach();
    return () => binding.detach();
  }, [binding]);

  useLayoutEffect(() => {
    // the nodes this binding already has: the ones it was created with, or last set
    if (created.current.binding !== binding) created.current = { binding, nodes: options.nodes };
    if (created.current.nodes === options.nodes) return;
    created.current.nodes = options.nodes;
    binding.setNodes(options.nodes);
  }, [binding, options.nodes]);

  return binding;
}
