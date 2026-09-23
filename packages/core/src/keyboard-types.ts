/** Public types for the keyboard driver (keyboard.ts): layers, chords, and the instance shape. */

import type { KernelKeyEvent } from "./keyboard-normalize.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * Runs a bound key. Returning `false` (exactly) DECLINES it: the press is not consumed, and the
 * layers below get their turn, as if this binding were not there. Anything else consumes it.
 */
export type KeyHandler = (e: KernelKeyEvent) => unknown;
export type KeyBindings = Record<string, KeyHandler>;

export interface KeyLayerOptions {
  /** sits below every non-base layer, whenever pushed: the app's own keys (law L2) */
  base?: boolean;
  /** unique among live layers; the default (`layer-N`) never repeats */
  id?: string;
  enabled?: boolean;
  /**
   * The id of the layer this one belongs to: a popover's dialog, a list's editor. It sits above
   * that layer and beside its other children, whatever order the two were pushed in (law L3), so
   * a host whose children mount before their parents (React) still stacks them right.
   */
  parent?: string;
  /**
   * A barrier (law L5): a key this layer does not take stops here, unprevented, instead of
   * reaching the layers below. What a dialog, a menu or a sheet is.
   */
  modal?: boolean;
  /** keys that cross this layer's barrier anyway, in any spelling: `mod+k` for the palette (L6) */
  passThrough?: readonly string[];
  /**
   * Asked at every press: whether the layer is live right now. For a layer whose relevance is a
   * fact about the host (a dialog is open, a thread is open) rather than something to push and
   * pop in step with it. A dead layer neither fires nor arms a chord.
   */
  active?: () => boolean;
}

/** What `bindScopes` needs to put a node list on the keyboard, one layer per scope. */
export interface ScopeBindingOptions {
  /** the nodes; those without a `shortcut` are left out */
  nodes: readonly CommandNode[];
  /** every scope, LOWEST precedence first: a live later scope wins a key from an earlier one */
  scopes: readonly string[];
  /**
   * Scopes that are live because something is OPEN rather than because of a fact: a dialog, a
   * suggestion list. They get no layer here; `ScopeBinding.mount` pushes one while it is open.
   */
  mounted?: readonly string[];
  /** the ctx at the moment of the press (built fresh: facts, focus) */
  ctx: () => Ctx;
  /** which scopes are live under that ctx */
  activeScopes: (ctx: Ctx) => readonly string[];
  /** run it: the host calls `kernel.executeNode` (or its own runner) */
  onActivate: (node: CommandNode, ctx: Ctx) => void;
  /**
   * The key was bound here, nothing took it, and the reason is that a node is DISABLED (not
   * hidden): the host says why ("This is the last thread"), so a key never fails in silence.
   * Called once per press, with the top-most disabled candidate, only when no other layer (and
   * no other node) took the key. A key that is merely not live here stays silent.
   */
  onDisabled?: (node: CommandNode, reason: string, ctx: Ctx) => void;
}

/** How a mounted scope's layer sits: everything a layer takes except its bindings. */
export type MountOptions = Omit<KeyLayerOptions, "base" | "active">;

/** The layers `bindScopes` pushed. `dispose` pops them all, mounted ones included. */
export interface ScopeBinding {
  readonly layers: readonly KeyLayer[];
  /**
   * Push one of the `mounted` scopes as a layer (law L13): its nodes run, decline and say why
   * exactly as a facts scope's do. Pop it with `keyboard.popLayer` when the thing closes.
   */
  mount(scope: string, options?: MountOptions): KeyLayer;
  dispose(): void;
}

/** One layer as `describeStack` reports it. */
export interface LayerInfo {
  id: string;
  parent?: string;
  base: boolean;
  modal: boolean;
  /** enabled, and `active()` (if any) says yes right now */
  live: boolean;
  /** its bindings, canonical */
  keys: string[];
}

/** A key a press would reach right now, and the layer (and node, if known) that has it. */
export interface ReachableKey {
  binding: string;
  layerId: string;
  node?: CommandNode;
}

export interface StackDescription {
  /** top first */
  layers: LayerInfo[];
  /** first owner wins, barriers respected; a node may still decline (`when`, `disabled`) */
  reachable: ReachableKey[];
}

export interface KeyLayer {
  id: string;
  bindings: KeyBindings;
  options: KeyLayerOptions;
}

export type ChordListener = (prefix: string | null) => void;

/** A press whose bindings all declined: the binding (`mod+Enter`, `g m`) and the event. */
export type DeclinedListener = (binding: string, e: KernelKeyEvent) => void;

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

/** One independent keyboard state machine - layers + chord state, no DOM. */
export interface Keyboard {
  /** the host's keydown entrypoint; bound, so it can be passed as a listener */
  handleKeydown: (e: KernelKeyEvent) => void;
  pushLayer(bindings: KeyBindings, options?: KeyLayerOptions): KeyLayer;
  popLayer(layer: KeyLayer): void;
  /** bind a Map of shortcut strings -> nodes as one base layer */
  registerShortcuts(nodes: Map<string, CommandNode>, options: ShortcutDriverOptions): KeyLayer;
  /**
   * Bind nodes by CONTEXT: one layer per scope, live while `activeScopes(ctx())` names it, so `j`
   * can be "next thread" in the list and nothing at all while a dialog is open, and `Escape` can
   * be "discard" in the editor and "back" in the thread. At each press the key's nodes in the
   * top live scope are tried in order; one hidden by `when` or `disabled` for that ctx declines,
   * and the key falls through to the scopes below (and then to the browser). Rebind by
   * disposing and binding again when the node list changes.
   */
  bindScopes(options: ScopeBindingOptions): ScopeBinding;
  /** observe chord-mode edges (prefix armed / cleared) for UI hints */
  subscribeChordMode(fn: ChordListener): () => void;
  /**
   * Told when a press found bindings for its key but every one DECLINED (returned false), so
   * nothing ran and the key went on to the browser. `bindScopes` uses it to say why.
   */
  onDeclined(fn: DeclinedListener): () => void;
  exitChordMode(): void;
  setChordTimeout(ms: number): void;
  /**
   * Mute the whole stack. GLOBAL rather than per-layer because the caller that
   * needs it most - a key RECORDER capturing the chord a user is about to bind -
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
  /** the live stack as data: for key hints, a help sheet, and a test that asserts it (L14) */
  describeStack(): StackDescription;
  /** told after every push and pop (L16); returns the unsubscribe */
  subscribeStack(fn: () => void): () => void;
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
