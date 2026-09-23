/**
 * Shortcut string parser and keyboard event matcher.
 *
 * Shortcut strings are platform-agnostic: `mod` maps to Cmd on Mac, Ctrl
 * elsewhere. Format: `mod+shift+d` (order-insensitive, case-insensitive).
 *
 * The kernel owns parsing + matching. The HOST owns the actual `addEventListener`
 * registration (the kernel has no DOM dependency).
 */

/**
 * The subset of a DOM KeyboardEvent the kernel reads. Structural on purpose:
 * core ships without the DOM type lib, and a real browser event satisfies it.
 */
export interface KeyEventLike {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

// structural peek at the browser global (when a host provides one) - keeps the
// DOM lib out of core while still auto-detecting the platform in a browser
const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator;
export const isMac = Boolean(
  nav && (/Mac|iPhone|iPad|iPod/.test(nav.platform ?? "") || /Macintosh/.test(nav.userAgent ?? "")),
);

export interface ParsedShortcut {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

/** The platform a shortcut is shown for. Defaults to the one detected (`isMac`). */
export type Platform = "mac" | "other";

export const currentPlatform: Platform = isMac ? "mac" : "other";

/**
 * A named key as a shortcut string spells it (lower case, any alias) -> the `KeyboardEvent.key`
 * a real press reports. Without this, `mod+enter` normalized to `mod+enter` while the press was
 * `mod+Enter`, and a node bound to Enter, Escape or an arrow never fired.
 */
const KEY_NAMES: Record<string, string> = {
  enter: "Enter",
  return: "Enter",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  arrowup: "ArrowUp",
  up: "ArrowUp",
  arrowdown: "ArrowDown",
  down: "ArrowDown",
  arrowleft: "ArrowLeft",
  left: "ArrowLeft",
  arrowright: "ArrowRight",
  right: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  plus: "+",
};

/**
 * One key, spelled the way the dispatcher compares it: a named key as `KeyboardEvent.key` spells
 * it (`Enter`, `ArrowDown`, `Space`, `F5`), a printable one in lower case (`k`, `?`).
 */
export function canonicalKey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toLowerCase();
  const lower = key.toLowerCase();
  const named = KEY_NAMES[lower];
  if (named !== undefined) return named;
  if (/^f\d{1,2}$/.test(lower)) return lower.toUpperCase();
  return key;
}

/**
 * Whether a printable key is a symbol whose Shift is already in the character: `?` is Shift+/
 * on one layout and a key of its own on another, so `?` is the binding and the Shift is not.
 * Letters keep theirs (`shift+j` is not `j`).
 */
export function isShiftedSymbol(key: string): boolean {
  return key.length === 1 && key !== " " && key.toLowerCase() === key.toUpperCase();
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const lower = shortcut.toLowerCase();
  // `+` separates modifiers, so the plus KEY is `+` alone or a trailing `++` (`mod++`)
  const plusKey = lower === "+" || lower.endsWith("++");
  const parts = (plusKey ? lower.slice(0, -1) : lower).split("+");
  const key = plusKey ? "+" : (parts.pop() ?? "");
  return {
    key,
    mod: parts.includes("mod") || parts.includes("cmd") || parts.includes("meta"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("opt") || parts.includes("option"),
    ctrl: parts.includes("ctrl"),
  };
}

export function matchesEvent(parsed: ParsedShortcut, e: KeyEventLike): boolean {
  if (e.key.toLowerCase() !== parsed.key && e.code.toLowerCase() !== `key${parsed.key}`) {
    return false;
  }
  const wantMeta = isMac ? parsed.mod : parsed.ctrl || parsed.mod;
  const wantCtrl = isMac ? parsed.ctrl : false;
  if ((isMac ? e.metaKey : e.ctrlKey) !== wantMeta) return false;
  if (isMac && e.ctrlKey !== wantCtrl) return false;
  if (e.shiftKey !== parsed.shift) return false;
  if (e.altKey !== parsed.alt) return false;
  return true;
}
