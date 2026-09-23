import { useRef } from "react";
import { useKeyboardContext } from "./keyboard-context.js";
import { type LayerOptions, liveOptions, useLayerLifecycle } from "./use-keyboard-layer.js";

/**
 * Mount one of the app's `mounted` scopes while this component is mounted (law L13): the
 * commands declared in that scope take their keys, above the nearest layer around it. The keys
 * come from the command nodes, never from here, so a hint and the help sheet read the same ones.
 * When the commands change, the host calls `scopes.setNodes(...)` and this layer keeps its place.
 */
export function useKeyboardScope(scope: string, options: LayerOptions = {}): string | undefined {
  const { keyboard, scopes } = useKeyboardContext();
  if (scopes === null) {
    throw new Error(
      `@command-kernel/react: KeyboardScope "${scope}" needs <KeyboardProvider scopes={...}>`,
    );
  }
  const pass = (options.passThrough ?? []).join("\n");
  const shape = useRef("");

  return useLayerLifecycle(
    (id, parent) => {
      shape.current = `${options.modal === true}|${pass}`;
      return scopes.mount(scope, {
        id,
        ...liveOptions(options),
        ...(parent === undefined ? {} : { parent }),
      });
    },
    (layer) => {
      const next = `${options.modal === true}|${pass}`;
      if (next === shape.current) return;
      shape.current = next;
      keyboard.updateLayer(layer, { options: liveOptions(options) });
    },
    options,
    `scope:${scope}`,
    [scopes, scope],
  );
}
