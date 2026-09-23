import { useEffect, useId } from "react";
import { useKeyboardContext } from "./keyboard-context.js";
import { type LayerOptions, layerOptions } from "./use-keyboard-layer.js";

/**
 * Mount one of the app's `mounted` scopes while this component is mounted (law L13): the
 * commands declared in that scope take their keys, above the nearest layer around it. The keys
 * come from the command nodes, never from here, so a hint and the help sheet read the same ones.
 */
export function useKeyboardScope(scope: string, options: LayerOptions = {}): string {
  const { keyboard, scopes, parent } = useKeyboardContext();
  if (scopes === null) {
    throw new Error(
      `@command-kernel/react: KeyboardScope "${scope}" needs <KeyboardProvider scopes={...}>`,
    );
  }
  const auto = useId();
  const id = options.id ?? `scope:${scope}${auto}`;
  const pass = (options.passThrough ?? []).join("\n");
  const modal = options.modal === true;
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    const passThrough = pass === "" ? [] : pass.split("\n");
    const layer = scopes.mount(scope, layerOptions(id, parent, { modal, passThrough }));
    return () => keyboard.popLayer(layer);
  }, [keyboard, scopes, scope, id, parent, modal, pass, enabled]);

  return id;
}
