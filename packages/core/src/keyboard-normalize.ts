/**
 * Key normalization for the keyboard driver (keyboard.ts): the structural event
 * shape, the "is this keystroke being typed?" guard, and canonicalizing a
 * keydown (or a parsed shortcut string) to one comparable form. Pure and
 * module-level - no layer stack, no chord state.
 */

import { isMac, type KeyEventLike, type ParsedShortcut } from "./shortcut.js";

// ── Key normalization (pure, module-level) ──────────────────────────────────

/** A key event the dispatcher can consume AND cancel - a browser keydown fits. */
export interface KernelKeyEvent extends KeyEventLike {
  /**
   * Whatever the host's event system calls the focused thing. `unknown` rather
   * than a structural `{ tagName?: string }`, because an all-optional shape is a
   * WEAK TYPE in TypeScript: a DOM `EventTarget` shares none of its properties
   * and would fail to assign, which would break the one line of host wiring this
   * whole interface exists to make possible.
   */
  readonly target?: unknown;
  preventDefault(): void;
  stopPropagation(): void;
}

/** modifier keys that never make a binding on their own - `keyboard-dispatch.ts` short-circuits on these */
export const IGNORE = new Set(["Control", "Meta", "Alt", "Shift"]);

/** Tags that consume a printable keystroke as text rather than as a command. */
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * ARIA roles whose widget owns the printable keys itself - a listbox does its own typeahead, a menu
 * jumps to the item you spelled, a textbox is a textbox however it was built.
 *
 * THE TAG CHECK ABOVE IS NOT ENOUGH and every headless UI library is why. Base UI, Radix and
 * Headless UI all render a select as a `div` with a role, and focus lands on the OPTION rather than
 * on anything a `tagName` test would catch. Measured in Chrome against Base UI's Select: with the
 * popup open, `document.activeElement` was `DIV[role=option]`, and a bare `n` bound to "New task"
 * opened a dialog over the menu the user was reading instead of jumping to "Nok".
 */
const WIDGET_ROLES = new Set([
  "combobox",
  "grid",
  "gridcell",
  "listbox",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
  "textbox",
  "tree",
  "treegrid",
  "treeitem",
]);

/** `[role=combobox], [role=grid], ...` - built once, for the `closest` probe. */
const WIDGET_SELECTOR = [...WIDGET_ROLES].map((r) => `[role="${r}"]`).join(",");

/** What the guard duck-types its way through. Every member is optional and probed before use. */
interface TargetLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  role?: unknown;
  getAttribute?: unknown;
  closest?: unknown;
}

/** The element's ARIA role, from the reflected property or the attribute, whichever it has. */
function roleOf(el: TargetLike): string | null {
  if (typeof el.role === "string" && el.role !== "") return el.role;
  if (typeof el.getAttribute === "function") {
    const attr = (el.getAttribute as (name: string) => unknown)("role");
    if (typeof attr === "string" && attr !== "") return attr;
  }
  return null;
}

/**
 * The default answer to "is this keystroke being TYPED?" - a structural sniff at
 * the event target, so core still imports no DOM lib. A host with a different
 * event system (a terminal, React Native, a canvas) replaces it wholesale via
 * `createKeyboard({ isEditableTarget })`.
 */
export function isEditableTarget(e: KernelKeyEvent): boolean {
  const el = e.target as TargetLike | null | undefined;
  if (!el) return false;
  if (typeof el.tagName === "string" && EDITABLE_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.isContentEditable === true) return true;

  const role = roleOf(el);
  if (role !== null && WIDGET_ROLES.has(role.toLowerCase())) return true;

  // Focus can sit on a child of the widget, or on a trigger inside it, rather than on the element
  // carrying the role. `closest` is the DOM's own answer and costs nothing when it is absent.
  if (typeof el.closest === "function") {
    return (el.closest as (selector: string) => unknown)(WIDGET_SELECTOR) != null;
  }
  return false;
}

/**
 * Whether a normalized binding carries a modifier that makes it a COMMAND rather
 * than typing. Shift is deliberately excluded: `shift+/` is a `?` character, not
 * a chord, and treating it as one steals the key from every text field.
 */
const PASS_THROUGH_MODS = new Set(["mod", "ctrl", "alt"]);

export function hasModifier(normalized: string): boolean {
  return normalized.split("+").some((p) => PASS_THROUGH_MODS.has(p));
}

function altCodeToKey(code: string): string | null {
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return code.slice(6);
  if (code.startsWith("Key") && code.length === 4) return code.slice(3).toLowerCase();
  return null;
}

export function normalizeEvent(e: KeyEventLike): string {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("mod");
  if (isMac && e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (!IGNORE.has(e.key)) {
    const altKey = e.altKey ? altCodeToKey(e.code) : null;
    const key =
      altKey ?? (e.key === " " ? "Space" : e.key.length === 1 ? e.key.toLowerCase() : e.key);
    parts.push(key);
  }
  return parts.join("+");
}

/**
 * Normalize a parsed shortcut string to the same canonical form
 * `normalizeEvent` yields for the matching keydown - the pure counterpart, so
 * registering a shortcut never has to construct a DOM event.
 */
export function normalizeShortcut(parsed: ParsedShortcut): string {
  const parts: string[] = [];
  if (isMac ? parsed.mod : parsed.mod || parsed.ctrl) parts.push("mod");
  if (isMac && parsed.ctrl) parts.push("ctrl");
  if (parsed.alt) parts.push("alt");
  if (parsed.shift) parts.push("shift");
  parts.push(
    parsed.key === " " ? "Space" : parsed.key.length === 1 ? parsed.key.toLowerCase() : parsed.key,
  );
  return parts.join("+");
}
