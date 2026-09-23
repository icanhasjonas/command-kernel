import type { Keyboard, ScopeBinding } from "@command-kernel/core";
import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * What a layer needs from above it: the one keyboard, the app's scope binding (for mounted
 * scopes), and the id of the nearest layer, which becomes its `parent` (law L3). Carried by
 * React context, so it follows the component tree through portals: a popover rendered into
 * `document.body` from inside a dialog is still the dialog's child.
 */
export interface KeyboardContextValue {
  keyboard: Keyboard;
  scopes: ScopeBinding | null;
  parent: string | undefined;
}

export const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function useKeyboardContext(): KeyboardContextValue {
  const value = useContext(KeyboardContext);
  if (value === null) {
    throw new Error("@command-kernel/react: render this inside <KeyboardProvider>");
  }
  return value;
}

/** The app's keyboard, for a host that needs it directly (chord hints, suspend). */
export function useKeyboard(): Keyboard {
  return useKeyboardContext().keyboard;
}

/**
 * Everything under `children` pushes its layers above layer `id`; with no `id` (a disabled
 * layer) they attach to the layer outside. Rendered either way, so switching a layer off never
 * changes the tree shape and never remounts (re-opens) what is inside it.
 */
export function OwnedBy({ id, children }: { id: string | undefined; children?: ReactNode }) {
  const outer = useKeyboardContext();
  const parent = id ?? outer.parent;
  const value = useMemo(() => ({ ...outer, parent }), [outer, parent]);
  return <KeyboardContext value={value}>{children}</KeyboardContext>;
}
