/**
 * Keystroke dispatch for the keyboard driver (keyboard.ts): turns a normalized keydown into a
 * bound handler call, or arms a chord. One walk, top layer down, decides both (law L1): the
 * NEAREST live layer that knows the key - as a binding, or as the first key of a chord - takes
 * it. Modal layers are barriers (L5), and a press whose default is prevented, or that an input
 * method is composing, never gets here (L7, L9). Reads the layer stack and the chord state; owns
 * neither.
 */

import type { ChordState } from "./keyboard-chord.js";
import type { LayerStack } from "./keyboard-layers.js";
import { crosses, isLive } from "./keyboard-layers.js";
import type { KernelKeyEvent } from "./keyboard-normalize.js";
import { hasModifier, IGNORE, isComposing, normalizeEvent } from "./keyboard-normalize.js";
import type { ChordCompletion, DeclinedListener, KeyLayer } from "./keyboard-types.js";

export interface DispatchDeps {
  stack: LayerStack;
  chord: ChordState;
  editableTarget: (e: KernelKeyEvent) => boolean;
  isSuspended: () => boolean;
}

export interface Dispatch {
  handleKeydown: (e: KernelKeyEvent) => void;
  onDeclined(fn: DeclinedListener): () => void;
  chordCompletions(prefix?: string): ChordCompletion[];
  /** how many keydowns this dispatcher has seen: a press's identity, for per-press caches */
  press(): number;
  /** whether a keydown is being dispatched right now: per-press caches are valid only then */
  pressing(): boolean;
  /** run `fn` as if it were one press: per-press caches (the ctx) are built once for it */
  snapshot<T>(fn: () => T): T;
}

/**
 * The live layers top down, each with a test for whether a binding gets past the barriers above.
 * Over a SNAPSHOT of the stack: a handler that pushes or pops (and so re-sorts the live array)
 * must not make the walk skip a layer or see one twice.
 */
export function* walk(stack: LayerStack): Generator<[KeyLayer, (binding: string) => boolean]> {
  const barriers: KeyLayer[] = [];
  const reaches = (binding: string) => barriers.every((b) => crosses(b, binding));
  const layers = [...stack.layers];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer || !isLive(layer)) continue;
    yield [layer, reaches];
    if (layer.options.modal === true) barriers.push(layer);
  }
}

/** Whether `layer` binds a chord that starts with `prefix` and gets past the barriers above. */
function startsChord(layer: KeyLayer, prefix: string, reaches: (b: string) => boolean): boolean {
  const head = `${prefix} `;
  return Object.keys(layer.bindings).some(
    (k) => k.startsWith(head) && k.length > head.length && reaches(k),
  );
}

/** Who decides `binding` (a key, or a chord so far) and how: the rule of law L1, as data. */
export interface Decision {
  layer: KeyLayer;
  /** "arm": a chord goes on from here; "key": the binding runs */
  kind: "arm" | "key";
}

/**
 * The nearest live layer that knows `binding` - binds it, or binds a chord that starts with it -
 * and whether it arms or runs. In one layer a chord beats a single key. The decision a press
 * makes, before any handler has a chance to decline; `describeStack` and `chordCompletions`
 * read it so they cannot disagree with a press.
 */
export function decide(stack: LayerStack, binding: string): Decision | null {
  for (const [layer, reaches] of walk(stack)) {
    if (startsChord(layer, binding, reaches)) return { layer, kind: "arm" };
    if (reaches(binding) && layer.bindings[binding]) return { layer, kind: "key" };
  }
  return null;
}

export function createDispatch({
  stack,
  chord,
  editableTarget,
  isSuspended,
}: DispatchDeps): Dispatch {
  /**
   * Every next key that would RUN something after `prefix` (default: the armed one), and the
   * node it runs - decided exactly as the press would decide it (`decide`). A key that would only
   * arm a longer chord is not listed. A suspended stack returns nothing: nothing would fire.
   */
  function chordCompletions(prefix?: string): ChordCompletion[] {
    const armed = prefix ?? chord.chordPrefix;
    if (armed === undefined || armed === null || isSuspended()) return [];
    if (decide(stack, armed)?.kind !== "arm") return [];
    const head = `${armed} `;
    const seen = new Map<string, ChordCompletion>();
    for (const layer of [...stack.layers].reverse()) {
      for (const shortcut of Object.keys(layer.bindings)) {
        const key = shortcut.slice(head.length);
        if (!shortcut.startsWith(head) || key.includes(" ") || seen.has(key)) continue;
        const d = decide(stack, shortcut);
        if (d?.kind !== "key") continue;
        const node = stack.nodesFor(d.layer)?.get(shortcut);
        seen.set(key, node === undefined ? { key, shortcut } : { key, shortcut, node });
      }
    }
    return [...seen.values()];
  }

  const declinedListeners = new Set<DeclinedListener>();

  /**
   * Offer `binding` down the stack (law L1). The first layer that binds a chord on it ARMS; the
   * first that binds it runs, unless its handler returns `false` (declined, L4), and the next
   * layer down gets its turn. Consumed only when taken: a key nobody takes is left to the browser,
   * unprevented. `before` runs just ahead of a handler (the chord leaves chord mode first).
   */
  function offer(
    binding: string,
    e: KernelKeyEvent,
    before?: () => void,
  ): "fired" | "armed" | "none" {
    let offered = false;
    for (const [layer, reaches] of walk(stack)) {
      if (startsChord(layer, binding, reaches)) return "armed";
      const handler = reaches(binding) ? layer.bindings[binding] : undefined;
      if (!handler) continue;
      offered = true;
      before?.();
      if (handler(e) !== false) {
        e.preventDefault();
        e.stopPropagation();
        return "fired";
      }
    }
    if (offered) for (const fn of declinedListeners) fn(binding, e);
    return "none";
  }

  let presses = 0;
  let inPress = false;

  function dispatch(e: KernelKeyEvent): void {
    if (isSuspended()) return;
    if (IGNORE.has(e.key)) return;
    // a widget nearer the focus already used this key: its own key beats an app shortcut (L7)
    if (e.defaultPrevented === true) return;
    // an input method is composing: its Enter picks a candidate, its Escape cancels it (L9)
    if (isComposing(e)) return;
    const normalized = normalizeEvent(e);

    const armed = chord.chordPrefix;
    if (armed !== null) {
      const full = `${armed} ${normalized}`;
      // the chord is over whether or not the second key is taken; leave it before running, so a
      // handler that opens something starts from a clean slate
      const result = offer(full, e, () => chord.exitChordMode());
      if (result === "armed") {
        e.preventDefault();
        chord.enterChordMode(full);
      } else if (result === "none") {
        chord.exitChordMode();
      }
      return;
    }

    // TYPING BEATS COMMANDING (L8). A printable key with no mod, aimed at an editable surface,
    // belongs to that surface. Modified combos (mod+k) and non-printables (Escape, ArrowDown) are
    // never typing, so they pass. AFTER the chord block - a prefix the user armed on purpose
    // still resolves - and BEFORE arming, so a bare prefix does not swallow the first letter of
    // a word.
    if (editableTarget(e) && !hasModifier(normalized) && e.key.length === 1) return;

    if (offer(normalized, e) === "armed") {
      e.preventDefault();
      chord.enterChordMode(normalized);
    }
  }

  function snapshot<T>(fn: () => T): T {
    // already inside one (a handler reading describeStack): it shares that press's ctx
    if (inPress) return fn();
    presses++;
    inPress = true;
    try {
      return fn();
    } finally {
      inPress = false;
    }
  }

  return {
    handleKeydown: (e) => snapshot(() => dispatch(e)),
    snapshot,
    chordCompletions,
    press: () => presses,
    pressing: () => inPress,
    onDeclined(fn) {
      declinedListeners.add(fn);
      return () => declinedListeners.delete(fn);
    },
  };
}
