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
  /** the app's scope binding (`useScopeBinding`), or `undefined` when the app has none */
  scopes: ScopeBinding | undefined;
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

/** Everything under `children` pushes its layers above layer `id` (law L3). */
export function OwnedBy({ id, children }: { id: string; children?: ReactNode }) {
  const outer = useKeyboardContext();
  const value = useMemo(() => ({ ...outer, parent: id }), [outer, id]);
  return <KeyboardContext value={value}>{children}</KeyboardContext>;
}
