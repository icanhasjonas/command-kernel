import type { Keyboard, ScopeBinding } from "@command-kernel/core";
import { type ReactNode, useEffect, useMemo } from "react";
import { attachKeyboard, type KeySource } from "./attach-keyboard.js";
import { KeyboardContext } from "./keyboard-context.js";

export interface KeyboardProviderProps {
  /** the app's ONE keyboard (`createKeyboard()`): every layer below goes on its stack */
  keyboard: Keyboard;
  /** the app's scope binding, when layers mount scopes (`KeyboardScope`): `useScopeBinding` */
  scopes?: ScopeBinding;
  /** where keys are heard (default `window`); `null` when the host feeds `handleKeydown` itself */
  source?: KeySource | null;
  children?: ReactNode;
}

/**
 * The root of the keyboard: attaches the one listener (bubble phase, law L15) and hands the
 * keyboard to every `KeyboardLayer` and `KeyboardScope` below.
 */
export function KeyboardProvider({ keyboard, scopes, source, children }: KeyboardProviderProps) {
  useEffect(() => {
    const target = source === undefined ? window : source;
    if (target === null) return;
    return attachKeyboard(keyboard, target);
  }, [keyboard, source]);
  const value = useMemo(() => ({ keyboard, scopes, parent: undefined }), [keyboard, scopes]);
  return <KeyboardContext value={value}>{children}</KeyboardContext>;
}
