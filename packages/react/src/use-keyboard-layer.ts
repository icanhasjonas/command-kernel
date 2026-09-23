import type { KeyBindings, KeyLayer, KeyLayerOptions } from "@command-kernel/core";
import { useId, useLayoutEffect, useRef } from "react";
import { useKeyboardContext } from "./keyboard-context.js";

/** How a layer sits on the stack. Its parent is not here: it is the nearest layer around it. */
export interface LayerOptions {
  /** unique among live layers; defaults to one React makes (`useId`) */
  id?: string;
  /** a barrier: keys this layer does not take stop here (law L5). Dialogs, menus, sheets */
  modal?: boolean;
  /** keys that cross the barrier anyway, in any spelling (law L6) */
  passThrough?: readonly string[];
  /** off: the layer stays on the stack but takes no key and is no barrier; its children stay */
  enabled?: boolean;
}

/** The part of the core options that may change while a layer is up (updated in place, L17). */
export function liveOptions(options: LayerOptions): Omit<KeyLayerOptions, "id"> {
  return { modal: options.modal === true, passThrough: options.passThrough ?? [] };
}

/**
 * Keep one layer on the stack for as long as the component is mounted: pushed on mount (under
 * the nearest layer around it, law L3) and popped on unmount. That is the ONLY push, besides a
 * new `id` or a change in `reset` (the scope binding, the scope). Everything else is applied in
 * place (law L17), so a layer never jumps above one opened after it: a new owner, `enabled`
 * switching (a disabled layer stays on the stack, not live, and keeps its children), and a new
 * `shape` - the hook's own keys and options - which `apply` writes. Returns the layer's id.
 */
export function useLayerLifecycle(
  push: (base: KeyLayerOptions) => KeyLayer,
  apply: (layer: KeyLayer) => void,
  shape: string,
  options: LayerOptions,
  prefix: string,
  reset: readonly unknown[] = [],
): string {
  const { keyboard, parent } = useKeyboardContext();
  const auto = useId();
  const id = options.id ?? `${prefix}${auto}`;
  const enabled = options.enabled !== false;
  const layer = useRef<KeyLayer | null>(null);
  const applied = useRef("");
  const latest = useRef({ push, apply, shape, parent, enabled });
  useLayoutEffect(() => {
    latest.current = { push, apply, shape, parent, enabled };
  });
  const [resetA, resetB] = reset;

  // A LAYOUT effect: React tears layout effects down when a shown Suspense boundary suspends
  // again, and a hidden screen must not keep its keys (passive effects stay mounted then).
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetA/resetB re-open the layer on purpose (a new scope binding, a new scope); everything else is applied in place below
  useLayoutEffect(() => {
    const now = latest.current;
    const base: KeyLayerOptions = { id };
    if (now.parent !== undefined) base.parent = now.parent;
    if (!now.enabled) base.enabled = false;
    const pushed = now.push(base);
    layer.current = pushed;
    applied.current = now.shape;
    return () => {
      layer.current = null;
      keyboard.popLayer(pushed);
    };
  }, [keyboard, id, resetA, resetB]);

  // every render, in place (each a no-op when nothing changed). A layout effect too, so children
  // never sit under a new barrier for a frame.
  useLayoutEffect(() => {
    const current = layer.current;
    if (!current) return;
    if (current.options.parent !== parent) keyboard.updateLayer(current, { options: { parent } });
    if ((current.options.enabled !== false) !== enabled) {
      keyboard.updateLayer(current, { options: { enabled: enabled ? undefined : false } });
    }
    if (applied.current !== shape) {
      applied.current = shape;
      latest.current.apply(current);
    }
  });

  return id;
}

/**
 * Put `bindings` on the stack while this component is mounted, above the nearest layer around it
 * (law L3), and return the layer's id. A handler returning `false` declines (law L4).
 */
export function useKeyboardLayer(bindings: KeyBindings, options: LayerOptions = {}): string {
  const { keyboard } = useKeyboardContext();
  const handlers = useRef(bindings);
  useLayoutEffect(() => {
    handlers.current = bindings;
  });

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
    (base) => keyboard.pushLayer(proxy(), { ...base, ...liveOptions(options) }),
    (layer) => keyboard.updateLayer(layer, { bindings: proxy(), options: liveOptions(options) }),
    `${Object.keys(bindings).sort().join("\n")}|${shapeOf(options)}`,
    options,
    "layer",
  );
}

/** the options a hook writes in place, as one comparable string */
export const shapeOf = (options: LayerOptions) =>
  `${options.modal === true}|${(options.passThrough ?? []).join("\n")}`;
