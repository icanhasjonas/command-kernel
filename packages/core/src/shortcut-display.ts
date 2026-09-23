/**
 * How a shortcut string is SHOWN: the key caps a `<kbd>` hint draws, one line of text for a
 * title, and the `aria-keyshortcuts` value. Read from the same string the dispatcher binds, so a
 * hint can never name a key that does something else. Pure; the platform is a parameter (default:
 * the detected one) so a test, or a "show me the Windows keys" toggle, can ask for either.
 */

import {
  canonicalKey,
  currentPlatform,
  isShiftedSymbol,
  type Platform,
  parseShortcut,
} from "./shortcut.js";

/** A named key's cap, per platform; anything else is its canonical spelling, letters upper case. */
const CAPS: Record<string, { mac: string; other: string }> = {
  Enter: { mac: "Enter", other: "Enter" },
  Escape: { mac: "Esc", other: "Esc" },
  Tab: { mac: "Tab", other: "Tab" },
  Space: { mac: "Space", other: "Space" },
  Backspace: { mac: "⌫", other: "Backspace" },
  Delete: { mac: "⌦", other: "Del" },
  ArrowUp: { mac: "↑", other: "↑" },
  ArrowDown: { mac: "↓", other: "↓" },
  ArrowLeft: { mac: "←", other: "←" },
  ArrowRight: { mac: "→", other: "→" },
  PageUp: { mac: "PgUp", other: "PgUp" },
  PageDown: { mac: "PgDn", other: "PgDn" },
};

/** The caps of one step (`mod+shift+c` -> ["⌘", "⇧", "C"]). */
function stepCaps(step: string, platform: Platform): string[] {
  const p = parseShortcut(step);
  const mac = platform === "mac";
  const key = canonicalKey(p.key);
  // `?` already says Shift: showing it again would ask for Shift+Shift+/
  const shift = p.shift && !isShiftedSymbol(key);
  // each platform's own order: ⌃⌥⇧⌘ on a Mac, Ctrl+Alt+Shift elsewhere
  const caps: string[] = mac
    ? [
        ...(p.ctrl ? ["⌃"] : []),
        ...(p.alt ? ["⌥"] : []),
        ...(shift ? ["⇧"] : []),
        ...(p.mod ? ["⌘"] : []),
      ]
    : [
        ...(p.mod || p.ctrl ? ["Ctrl"] : []),
        ...(p.alt ? ["Alt"] : []),
        ...(shift ? ["Shift"] : []),
      ];
  caps.push(CAPS[key]?.[platform] ?? (key.length === 1 ? key.toUpperCase() : key));
  return caps;
}

/**
 * The key caps of a shortcut, one array per step of a chord, in the order the modifiers are
 * printed on the platform (Mac: ⌃⌥⇧⌘): `"g i"` -> [["G"], ["I"]], `"mod+enter"` -> [["⌘",
 * "Enter"]] on a Mac and [["Ctrl", "Enter"]] elsewhere.
 */
export function shortcutKeys(shortcut: string, platform: Platform = currentPlatform): string[][] {
  return shortcut
    .trim()
    .split(/\s+/)
    .filter((s) => s !== "")
    .map((step) => stepCaps(step, platform));
}

/**
 * One line for a title or a tooltip: `⌘Enter` on a Mac, `Ctrl+Enter` elsewhere, chord steps
 * apart (`G then I` reads as `G I`).
 */
export function formatShortcut(shortcut: string, platform: Platform = currentPlatform): string {
  const join = platform === "mac" ? "" : "+";
  return shortcutKeys(shortcut, platform)
    .map((caps) => caps.join(join))
    .join(" ");
}

/** A KeyboardEvent.key name as aria-keyshortcuts spells it. */
const ARIA_KEYS: Record<string, string> = { Space: "Space", "+": "Plus" };

/**
 * The `aria-keyshortcuts` value: `Meta+Enter` on a Mac, `Control+Enter` elsewhere. A chord (two
 * presses) has no spelling there, since a space separates ALTERNATIVES, so it answers "" and the
 * attribute is best left off.
 */
export function ariaKeyShortcuts(shortcut: string, platform: Platform = currentPlatform): string {
  const steps = shortcut.trim().split(/\s+/);
  if (steps.length !== 1 || steps[0] === undefined || steps[0] === "") return "";
  const p = parseShortcut(steps[0]);
  const key = canonicalKey(p.key);
  const parts: string[] = [];
  if (p.mod) parts.push(platform === "mac" ? "Meta" : "Control");
  if (p.ctrl && !(p.mod && platform !== "mac")) parts.push("Control");
  if (p.alt) parts.push("Alt");
  if (p.shift && !isShiftedSymbol(key)) parts.push("Shift");
  parts.push(ARIA_KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key));
  return parts.join("+");
}
