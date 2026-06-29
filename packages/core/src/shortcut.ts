/**
 * Shortcut string parser and keyboard event matcher.
 *
 * Shortcut strings are platform-agnostic: `mod` maps to Cmd on Mac, Ctrl
 * elsewhere. Format: `mod+shift+d` (order-insensitive, case-insensitive).
 *
 * The kernel owns parsing + matching. The HOST owns the actual `addEventListener`
 * registration (the kernel has no DOM dependency).
 */

const isMac =
  typeof navigator !== "undefined" &&
  (/Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent));

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

export function matchesEvent(parsed: ParsedShortcut, e: KeyboardEvent): boolean {
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
