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

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop() ?? "";
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

export function formatShortcut(shortcut: string): string {
  const p = parseShortcut(shortcut);
  const parts: string[] = [];
  if (p.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (p.ctrl && isMac) parts.push("⌃");
  if (p.shift) parts.push(isMac ? "⇧" : "Shift");
  if (p.alt) parts.push(isMac ? "⌥" : "Alt");
  parts.push(p.key.toUpperCase());
  return parts.join(isMac ? "" : "+");
}
