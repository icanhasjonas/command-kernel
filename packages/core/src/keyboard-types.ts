/** Public types for the keyboard driver (keyboard.ts): layers, chords, and the instance shape. */

import type { KernelKeyEvent } from "./keyboard-normalize.js";
import type { CommandNode } from "./types.js";

export type KeyHandler = (e: KernelKeyEvent) => void;
export type KeyBindings = Record<string, KeyHandler>;

export interface KeyLayerOptions {
  base?: boolean;
  id?: string;
  enabled?: boolean;
}

export interface KeyLayer {
  id: string;
  bindings: KeyBindings;
  options: KeyLayerOptions;
}

export type ChordListener = (prefix: string | null) => void;

export interface ShortcutDriverOptions {
  onActivate: (node: CommandNode) => void;
}

export interface KeyboardOptions {
  /** how long a chord prefix stays armed before it expires (default 2000ms) */
  chordTimeoutMs?: number;
  /**
   * Decide whether a keystroke is being typed into an editable surface rather
   * than aimed at a command. Defaults to `isEditableTarget`, which sniffs
   * `e.target` structurally.
   */
  isEditableTarget?: (e: KernelKeyEvent) => boolean;
}

/** One independent keyboard state machine — layers + chord state, no DOM. */
export interface Keyboard {
  /** the host's keydown entrypoint; bound, so it can be passed as a listener */
  handleKeydown: (e: KernelKeyEvent) => void;
  pushLayer(bindings: KeyBindings, options?: KeyLayerOptions): KeyLayer;
  popLayer(layer: KeyLayer): void;
  /** bind a Map of shortcut strings -> nodes as one base layer */
  registerShortcuts(nodes: Map<string, CommandNode>, options: ShortcutDriverOptions): KeyLayer;
  /** observe chord-mode edges (prefix armed / cleared) for UI hints */
  subscribeChordMode(fn: ChordListener): () => void;
  exitChordMode(): void;
  setChordTimeout(ms: number): void;
  /**
   * Mute the whole stack. GLOBAL rather than per-layer because the caller that
   * needs it most — a key RECORDER capturing the chord a user is about to bind —
   * cannot know which layer owns the key it is about to swallow.
   */
  setSuspended(value: boolean): void;
  /** whether the stack is currently muted */
  readonly suspended: boolean;
  /**
   * Whether any LIVE layer already owns this binding. `validateShortcuts` only
   * sees a static node list, so it cannot see anything registered ad hoc through
   * `pushLayer`; this asks the stack itself. Pass `excludeLayerId` so a layer
   * rebinding its own key does not report itself as the conflict.
   */
  isBindingRegistered(pattern: string, excludeLayerId?: string): boolean;
  /** the armed chord prefix, or null when not in chord mode */
  readonly chordPrefix: string | null;
  /**
   * Every second key that would complete `prefix`, and the node each one runs.
   *
   * THIS EXISTS SO A HOST CAN DRAW THE CHORD IT HAS ARMED. `subscribeChordMode` already says a
   * prefix went live, and until now that was the whole story: a UI that wanted to answer "you
   * pressed `g`, so what follows?" had to filter its own copy of the bindings. That copy is a
   * second source of truth for something this object knows exactly -- `isChordPrefix` walks the
   * live layer stack to decide whether to arm at all, and then discards the matches it found.
   *
   * The consequence of not having it is a real one rather than a tidiness argument: a chord the
   * user cannot see is a chord the user has to memorise, and a host-side copy of the binding list
   * goes stale the moment anything is bound through `pushLayer` at runtime, which is precisely
   * when a hint is most needed.
   *
   * Layer precedence is honoured exactly as a real press honours it -- later layers win, a
   * disabled layer is not consulted, and a suspended stack completes nothing -- so what comes back
   * is what WOULD FIRE, not what merely appears somewhere in the registry.
   *
   * `prefix` defaults to the armed one, so the common call is `chordCompletions()`.
   */
  chordCompletions(prefix?: string): ChordCompletion[];
}

/** One key that would complete an armed chord, and the node it would run. */
export interface ChordCompletion {
  /** the second key, normalized as the stack stores it -- `p`, `t`, `arrowdown` */
  key: string;
  /** the whole binding as registered -- `g p` */
  shortcut: string;
  /** the node this activates, when the binding came in through `registerShortcuts` */
  node?: CommandNode;
}
