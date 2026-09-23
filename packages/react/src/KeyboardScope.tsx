import type { ReactNode } from "react";
import { OwnedBy } from "./keyboard-context.js";
import type { LayerOptions } from "./use-keyboard-layer.js";
import { useKeyboardScope } from "./use-keyboard-scope.js";

/** `KeyboardLayer` for a mounted scope: the scope's commands, owning what is inside it. */
export function KeyboardScope({
  scope,
  children,
  ...options
}: LayerOptions & { scope: string; children?: ReactNode }) {
  const id = useKeyboardScope(scope, options);
  // disabled: no layer, and what is inside attaches to the next layer out
  return <OwnedBy id={id}>{children}</OwnedBy>;
}
