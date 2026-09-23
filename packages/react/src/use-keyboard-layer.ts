import type { KeyBindings, KeyLayerOptions } from "@command-kernel/core";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useKeyboardContext } from "./keyboard-context.js";

/** How a layer sits on the stack. Its parent is not here: it is the nearest layer above it. */
export interface LayerOptions {
  /** unique among live layers; defaults to one React makes (`useId`) */
  id?: string;
  /** a barrier: keys this layer does not take stop here (law L5). Dialogs, menus, sheets */
  modal?: boolean;
  /** keys that cross the barrier anyway, in any spelling (law L6) */
  passThrough?: readonly string[];
  /** off: no layer at all, as if unmounted */
  enabled?: boolean;
}

/** The core options for `options`, under `parent`. */
export function layerOptions(id: string, parent: string | undefined, options: LayerOptions) {
  const out: KeyLayerOptions = { id, modal: options.modal === true };
  if (parent !== undefined) out.parent = parent;
  if (options.passThrough?.length) out.passThrough = options.passThrough;
  return out;
}

/**
 * Put `bindings` on the stack while this component is mounted, above the nearest layer around
 * it (law L3), and return the layer's id. Pushed once and popped on unmount; a new handler on a
 * re-render is picked up without a re-push, and only a change to the SET of keys re-pushes.
 * A handler returning `false` declines (law L4).
 */
export function useKeyboardLayer(bindings: KeyBindings, options: LayerOptions = {}): string {
  const { keyboard, parent } = useKeyboardContext();
  const auto = useId();
  const id = options.id ?? `layer${auto}`;
  const latest = useRef(bindings);
  useLayoutEffect(() => {
    latest.current = bindings;
  });
  const keys = Object.keys(bindings).join("\n");
  const pass = (options.passThrough ?? []).join("\n");
  const modal = options.modal === true;
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    const proxy: KeyBindings = {};
    for (const k of keys === "" ? [] : keys.split("\n")) {
      proxy[k] = (e) => {
        const handler = latest.current[k];
        return handler ? handler(e) : false;
      };
    }
    const passThrough = pass === "" ? [] : pass.split("\n");
    const layer = keyboard.pushLayer(proxy, layerOptions(id, parent, { modal, passThrough }));
    return () => keyboard.popLayer(layer);
  }, [keyboard, id, parent, modal, pass, keys, enabled]);

  return id;
}
