/**
 * Keystroke dispatch for the keyboard driver (keyboard.ts): turns a normalized
 * keydown into a bound handler call, honouring layer precedence (later layers
 * win, a disabled layer is not consulted) and chord sequences (leader key ->
 * second key -> fire, or re-arm, or drop). Reads the layer stack and the chord
 * state; owns neither.
 */

import type { ChordState } from "./keyboard-chord.js";
import type { LayerStack } from "./keyboard-layers.js";
import type { KernelKeyEvent } from "./keyboard-normalize.js";
import { hasModifier, IGNORE, normalizeEvent } from "./keyboard-normalize.js";
import type { ChordCompletion, KeyBindings, KeyHandler } from "./keyboard-types.js";

export interface DispatchDeps {
  stack: LayerStack;
  chord: ChordState;
  editableTarget: (e: KernelKeyEvent) => boolean;
  isSuspended: () => boolean;
}

export interface Dispatch {
  handleKeydown: (e: KernelKeyEvent) => void;
  chordCompletions(prefix?: string): ChordCompletion[];
}

// ── Binding lookup (pure) ───────────────────────────────────────────────────

function findBinding(bindings: KeyBindings, normalized: string): KeyHandler | undefined {
  const handler = bindings[normalized];
  if (handler) return handler;
  if (normalized.includes("mod")) return bindings[normalized.replace("mod", "ctrl")];
  if (normalized.includes("ctrl")) return bindings[normalized.replace("ctrl", "mod")];
  return undefined;
}

export function createDispatch({
  stack,
  chord,
  editableTarget,
  isSuspended,
}: DispatchDeps): Dispatch {
  /**
   * Every second key that would complete `prefix` (default: the armed one), and the node each one
   * runs. Top layer first, and the first layer to claim a second key keeps it, which is the same
   * "later layers win" rule `handleKeydown` dispatches by. A suspended stack returns nothing:
   * nothing would fire, so nothing should be offered.
   */
  function chordCompletions(prefix?: string): ChordCompletion[] {
    const armed = prefix ?? chord.chordPrefix;
    if (armed === undefined || armed === null || isSuspended()) return [];

    const head = `${armed} `;
    const seen = new Map<string, ChordCompletion>();

    for (let i = stack.layers.length - 1; i >= 0; i--) {
      const layer = stack.layers[i];
      if (!layer || layer.options.enabled === false) continue;
      const nodes = stack.nodesFor(layer);
      for (const shortcut of Object.keys(layer.bindings)) {
        if (!shortcut.startsWith(head)) continue;
        const key = shortcut.slice(head.length);
        // A chord is exactly two presses here; anything with a further space is a deeper
        // sequence and is not a completion OF THIS prefix.
        if (key.length === 0 || key.includes(" ")) continue;
        if (seen.has(key)) continue;
        const node = nodes?.get(shortcut);
        seen.set(key, node === undefined ? { key, shortcut } : { key, shortcut, node });
      }
    }

    return [...seen.values()];
  }

  function isChordPrefix(normalized: string): boolean {
    return chordCompletions(normalized).length > 0;
  }

  function handleKeydown(e: KernelKeyEvent): void {
    if (isSuspended()) return;
    if (IGNORE.has(e.key)) return;
    const normalized = normalizeEvent(e);

    const armed = chord.chordPrefix;
    if (armed !== null) {
      const full = `${armed} ${normalized}`;
      for (let i = stack.layers.length - 1; i >= 0; i--) {
        const layer = stack.layers[i];
        if (!layer || layer.options.enabled === false) continue;
        const handler = findBinding(layer.bindings, full);
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          chord.exitChordMode();
          handler(e);
          return;
        }
      }
      if (isChordPrefix(full)) {
        e.preventDefault();
        chord.enterChordMode(full);
        return;
      }
      chord.exitChordMode();
      return;
    }

    // TYPING BEATS COMMANDING. A printable key with no mod, aimed at an editable
    // surface, belongs to that surface: without this, a bare `n` bound to "New
    // task" fires on every n somebody types into a title field. Modified combos
    // (mod+k) and non-printables (Escape, ArrowDown) are never typing, so they
    // pass. Deliberately placed AFTER the chord block — a prefix the user already
    // armed on purpose still resolves — and BEFORE arming, so a bare prefix does
    // not swallow the first letter of a word.
    if (editableTarget(e) && !hasModifier(normalized) && e.key.length === 1) return;

    if (isChordPrefix(normalized)) {
      e.preventDefault();
      chord.enterChordMode(normalized);
      return;
    }

    for (let i = stack.layers.length - 1; i >= 0; i--) {
      const layer = stack.layers[i];
      if (!layer || layer.options.enabled === false) continue;
      const handler = findBinding(layer.bindings, normalized);
      if (handler) {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
        return;
      }
    }
  }

  return { handleKeydown, chordCompletions };
}
