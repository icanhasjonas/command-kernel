import type { KeyBindings, KeyLayer, KeyLayerOptions } from "@command-kernel/core";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useKeyboardContext } from "./keyboard-context.js";

/** How a layer sits on the stack. Its parent is not here: it is the nearest layer around it. */
export interface LayerOptions {
  /** unique among live layers; defaults to one React makes (`useId`) */
  id?: string;
  /** a barrier: keys this layer does not take stop here (law L5). Dialogs, menus, sheets */
  modal?: boolean;
  /** keys that cross the barrier anyway, in any spelling (law L6) */
  passThrough?: readonly string[];
  /** off: no layer, and the layers inside it attach to the next layer out */
  enabled?: boolean;
}

/** The part of the core options that may change while a layer is up (updated in place, L17). */
export function liveOptions(options: LayerOptions): Omit<KeyLayerOptions, "id"> {
  return { modal: options.modal === true, passThrough: options.passThrough ?? [] };
}

/**
 * Keep one layer on the stack for as long as the component is mounted and `enabled`: `push`
 * creates it (under the nearest layer around it, law L3), and it is popped on unmount. That is
 * the ONLY push, besides a new `id` or a change in `reset` (the scope binding, the scope): new
 * bindings, options and even a new owner are applied in place (law L17), so a layer never jumps
 * above one opened after it. Returns the layer's id, or `undefined` while disabled.
 */
export function useLayerLifecycle(
  push: (id: string, parent: string | undefined) => KeyLayer,
  update: (layer: KeyLayer) => void,
  options: LayerOptions,
  prefix: string,
  reset: readonly unknown[] = [],
): string | undefined {
  const { keyboard, parent } = useKeyboardContext();
  const auto = useId();
  const id = options.id ?? `${prefix}${auto}`;
  const enabled = options.enabled !== false;
  const layer = useRef<KeyLayer | null>(null);
  const latest = useRef({ push, update, parent });
  useLayoutEffect(() => {
    latest.current = { push, update, parent };
  });
  const [resetA, resetB] = reset;

  // A LAYOUT effect: React tears layout effects down when a shown Suspense boundary suspends
  // again, and a hidden screen must not keep its keys (passive effects stay mounted then).
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetA/resetB re-open the layer on purpose (a new scope binding, a new scope); parent and handlers are applied in place below
  useLayoutEffect(() => {
    if (!enabled) return;
    const pushed = latest.current.push(id, latest.current.parent);
    layer.current = pushed;
    return () => {
      layer.current = null;
      keyboard.popLayer(pushed);
    };
  }, [keyboard, id, enabled, resetA, resetB]);

  // every render: the current owner, keys and options, in place (a no-op when nothing changed)
  useEffect(() => {
    const current = layer.current;
    if (!current) return;
    if (current.options.parent !== parent) keyboard.updateLayer(current, { options: { parent } });
    latest.current.update(current);
  });

  return enabled ? id : undefined;
}

/**
 * Put `bindings` on the stack while this component is mounted, above the nearest layer around it
 * (law L3), and return the layer's id. A handler returning `false` declines (law L4).
 */
export function useKeyboardLayer(
  bindings: KeyBindings,
  options: LayerOptions = {},
): string | undefined {
  const { keyboard } = useKeyboardContext();
  const handlers = useRef(bindings);
  useLayoutEffect(() => {
    handlers.current = bindings;
  });
  const keys = Object.keys(bindings).sort().join("\n");
  const pass = (options.passThrough ?? []).join("\n");
  const shape = useRef("");

  /** stable handlers that call the latest ones, so a new closure never needs an update */
  const proxy = (): KeyBindings => {
    const out: KeyBindings = {};
    for (const k of Object.keys(handlers.current)) {
      out[k] = (e) => {
        const handler = handlers.current[k];
        return handler ? handler(e) : false;
      };
    }
    return out;
  };

  return useLayerLifecycle(
    (id, parent) => {
      shape.current = `${keys}|${options.modal === true}|${pass}`;
      const core: KeyLayerOptions = { id, ...liveOptions(options) };
      if (parent !== undefined) core.parent = parent;
      return keyboard.pushLayer(proxy(), core);
    },
    (layer) => {
      const next = `${keys}|${options.modal === true}|${pass}`;
      if (next === shape.current) return;
      shape.current = next;
      keyboard.updateLayer(layer, { bindings: proxy(), options: liveOptions(options) });
    },
    options,
    "layer",
  );
}
