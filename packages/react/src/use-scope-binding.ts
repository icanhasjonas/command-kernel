import type { Keyboard, ScopeBinding, ScopeBindingOptions } from "@command-kernel/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * `keyboard.bindScopes(options)`, owned by a component. It binds in an EFFECT, never in render,
 * because binding pushes layers: in render (a `useMemo`), StrictMode's second pass leaks a
 * binding nobody disposes. New `nodes` go through `setNodes`, in place (L12); a new set of
 * `scopes` or `mounted` names is a new binding. `ctx`, `activeScopes`, `onActivate` and
 * `onDisabled` are read fresh on every press, so they may be new functions on every render.
 * Returns `null` until the first effect has run: `KeyboardScope` waits for it.
 */
export function useScopeBinding(
  keyboard: Keyboard,
  options: ScopeBindingOptions,
): ScopeBinding | null {
  const [binding, setBinding] = useState<ScopeBinding | null>(null);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const scopes = options.scopes.join("\n");
  const mounted = (options.mounted ?? []).join("\n");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `scopes` and `mounted` are the joined names; a new set of names is a new binding, a new array with the same names is not
  useEffect(() => {
    const o = latest.current;
    const b = keyboard.bindScopes({
      nodes: o.nodes,
      scopes: o.scopes,
      ...(o.mounted ? { mounted: o.mounted } : {}),
      ctx: () => latest.current.ctx(),
      activeScopes: (c) => latest.current.activeScopes(c),
      onActivate: (n, c) => latest.current.onActivate(n, c),
      onDisabled: (n, reason, c) => latest.current.onDisabled?.(n, reason, c),
    });
    setBinding(b);
    return () => {
      b.dispose();
      setBinding(null);
    };
  }, [keyboard, scopes, mounted]);

  useEffect(() => {
    binding?.setNodes(options.nodes);
  }, [binding, options.nodes]);

  return binding;
}
