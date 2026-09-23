import { useKeyboardContext } from "./keyboard-context.js";
import {
  type LayerOptions,
  liveOptions,
  shapeOf,
  useLayerLifecycle,
} from "./use-keyboard-layer.js";

/**
 * Mount one of the app's `mounted` scopes while this component is mounted (law L13): the
 * commands declared in that scope take their keys, above the nearest layer around it. The keys
 * come from the command nodes, never from here, so a hint and the help sheet read the same ones.
 * When the commands change, the host calls `scopes.setNodes(...)` and this layer keeps its place.
 */
export function useKeyboardScope(scope: string, options: LayerOptions = {}): string {
  const { keyboard, scopes } = useKeyboardContext();
  if (scopes === undefined) {
    throw new Error(
      `@command-kernel/react: KeyboardScope "${scope}" needs <KeyboardProvider scopes={...}>`,
    );
  }
  return useLayerLifecycle(
    (base) => scopes.mount(scope, { ...base, ...liveOptions(options) }),
    (layer) => keyboard.updateLayer(layer, { options: liveOptions(options) }),
    shapeOf(options),
    options,
    `scope:${scope}`,
    [scopes, scope],
  );
}
