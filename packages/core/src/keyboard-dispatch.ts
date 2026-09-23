/**
 * Keystroke dispatch for the keyboard driver (keyboard.ts). ONE walk decides everything (law
 * L1): `candidates` yields, top layer down, each live layer that knows a key sequence - arming a
 * chord that goes on from it, or binding it. A press takes the first that does not decline;
 * `decide` (what a description reads) takes the first that WOULD not decline, as far as the stack
 * can know. Modal layers are barriers (L5). Reads the stack and the chord state; owns neither.
 */

import type { ChordState } from "./keyboard-chord.js";
import type { LayerStack } from "./keyboard-layers.js";
import { crosses, isLive } from "./keyboard-layers.js";
import type { KernelKeyEvent } from "./keyboard-normalize.js";
import { hasModifier, IGNORE, isComposing, normalizeEvent } from "./keyboard-normalize.js";
import type { DeclinedListener, KeyHandler, KeyLayer } from "./keyboard-types.js";

export interface DispatchDeps {
  stack: LayerStack;
  chord: ChordState;
  editableTarget: (e: KernelKeyEvent) => boolean;
  isSuspended: () => boolean;
}

export interface Dispatch {
  handleKeydown: (e: KernelKeyEvent) => void;
  onDeclined(fn: DeclinedListener): () => void;
  /**
   * The press being handled, or the description being made, as a token: per-press caches (the
   * ctx a scope reads) key on it. `null` outside both. A description made INSIDE a press is a
   * token of its own, so it reads the facts as they are after the handler changed them.
   */
  current(): object | null;
  /** run `fn` as one press: per-press caches are built once for it */
  within<T>(fn: () => T): T;
}

/**
 * The live layers top down, each with a test for whether a binding gets past the barriers above.
 * Over a SNAPSHOT of the stack, skipping any layer popped since: a handler that pushes or pops
 * during the press can neither make the walk skip a layer nor run one that is gone.
 */
export function* walk(stack: LayerStack): Generator<[KeyLayer, (binding: string) => boolean]> {
  const barriers: KeyLayer[] = [];
  const reaches = (binding: string) => barriers.every((b) => crosses(b, binding));
  const layers = [...stack.layers];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer || !stack.has(layer) || !isLive(layer)) continue;
    yield [layer, reaches];
    if (layer.options.modal === true) barriers.push(layer);
  }
}

/** A layer that knows `binding`: it arms a chord that goes on from it, or it runs `handler`. */
export type Candidate =
  | { layer: KeyLayer; kind: "arm" }
  | { layer: KeyLayer; kind: "key"; handler: KeyHandler };

/**
 * Every layer that knows `binding`, nearest first (L1). In one layer a chord beats a single key.
 * A key's candidate that declines hands the press to the next candidate - which may arm.
 */
export function* candidates(stack: LayerStack, binding: string): Generator<Candidate> {
  const head = `${binding} `;
  for (const [layer, reaches] of walk(stack)) {
    const keys = Object.keys(layer.bindings);
    if (keys.some((k) => k.startsWith(head) && k.length > head.length && reaches(k))) {
      yield { layer, kind: "arm" };
      continue;
    }
    const handler = reaches(binding) ? layer.bindings[binding] : undefined;
    if (handler) yield { layer, kind: "key", handler };
  }
}

/**
 * What a press of `binding` would do, as far as the stack can know before running anything: the
 * first candidate that arms, or runs without declining. A node layer knows when its command
 * would decline (`when`, `disabled`); a plain handler is opaque and assumed to run.
 */
export function decide(stack: LayerStack, binding: string): Candidate | null {
  for (const c of candidates(stack, binding)) {
    if (c.kind === "arm" || stack.accepts(c.layer, binding)) return c;
  }
  return null;
}

export function createDispatch({
  stack,
  chord,
  editableTarget,
  isSuspended,
}: DispatchDeps): Dispatch {
  const declinedListeners = new Set<DeclinedListener>();
  let token: object | null = null;

  function within<T>(fn: () => T): T {
    const outer = token;
    token = {};
    try {
      return fn();
    } finally {
      token = outer;
    }
  }

  /**
   * Offer `binding` to its candidates (L1): the first that arms, arms; the first that runs
   * without declining (L4) takes the press. Consumed only when taken: a key nobody takes is left
   * to the browser, unprevented. `before` runs just ahead of a handler (a chord ends first).
   */
  function offer(
    binding: string,
    e: KernelKeyEvent,
    before?: () => void,
  ): "fired" | "armed" | "none" {
    let offered = false;
    for (const c of candidates(stack, binding)) {
      if (c.kind === "arm") return "armed";
      offered = true;
      before?.();
      if (c.handler(e) !== false) {
        e.preventDefault();
        e.stopPropagation();
        return "fired";
      }
    }
    if (offered) for (const fn of declinedListeners) fn(binding, e);
    return "none";
  }

  function dispatch(e: KernelKeyEvent): void {
    if (isSuspended()) return;
    if (IGNORE.has(e.key)) return;
    // a widget nearer the focus already used this key (L7), or an input method is composing
    // (L9): not a command, and not the next step of a pending chord either
    if (e.defaultPrevented === true || isComposing(e)) {
      if (chord.chordPrefix !== null) chord.exitChordMode();
      return;
    }
    const normalized = normalizeEvent(e);

    const armed = chord.chordPrefix;
    if (armed !== null) {
      const full = `${armed} ${normalized}`;
      // the chord is over whether or not the key is taken; leave it before running, so a handler
      // that opens something starts from a clean slate. A key that completes nothing just ends it.
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
    // belongs to that surface. AFTER the chord block - a prefix the user armed on purpose still
    // resolves - and BEFORE arming, so a bare prefix does not swallow the first letter of a word.
    if (editableTarget(e) && !hasModifier(normalized) && e.key.length === 1) return;

    if (offer(normalized, e) === "armed") {
      e.preventDefault();
      chord.enterChordMode(normalized);
    }
  }

  return {
    handleKeydown: (e) => within(() => dispatch(e)),
    within,
    current: () => token,
    onDeclined(fn) {
      declinedListeners.add(fn);
      return () => declinedListeners.delete(fn);
    },
  };
}
