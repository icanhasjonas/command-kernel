import type { KeyBindings } from "@command-kernel/core";
import type { ReactNode } from "react";
import { OwnedBy } from "./keyboard-context.js";
import { type LayerOptions, useKeyboardLayer } from "./use-keyboard-layer.js";

/**
 * A layer that owns what is inside it: every layer rendered under `children` (portals included)
 * sits above this one. Wrap a dialog's content, a popover, a suggestion list.
 */
export function KeyboardLayer({
  bindings,
  children,
  ...options
}: LayerOptions & { bindings: KeyBindings; children?: ReactNode }) {
  const id = useKeyboardLayer(bindings, options);
  // disabled: no layer, so what is inside attaches to the next layer out
  return id === undefined ? children : <OwnedBy id={id}>{children}</OwnedBy>;
}
