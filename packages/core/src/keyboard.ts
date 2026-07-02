/**
 * Framework-agnostic keyboard driver for the command kernel.
 *
 * Ported from remote-claude's key-layers system (battle-tested). Stripped of
 * React and terminal-specific concerns -- the kernel owns the state machine,
 * the HOST owns the DOM listener and React hooks:
 *
 *   const kb = createKeyboard();
 *   window.addEventListener("keydown", kb.handleKeydown, { capture: true });
 *
 * Core never touches window/document/KeyboardEvent — events arrive as the
 * structural `KernelKeyEvent`, which any real browser event satisfies. State
 * is INSTANCE-scoped (like every other seam): two kernels on one page get two
 * independent layer stacks, never shared chord state.
 *
 * Features:
 * - Layer stacking (LIFO, base vs modal)
 * - Chord sequences (leader key -> timeout -> fire)
 * - Platform-agnostic key normalization (mod = Cmd on Mac, Ctrl elsewhere)
 * - Conflict detection
 */

import { isMac, type KeyEventLike, type ParsedShortcut, parseShortcut } from "./shortcut.js";
import type { CommandNode } from "./types.js";

// ── Key normalization (pure, module-level) ──────────────────────────────────

/** A key event the dispatcher can consume AND cancel — a browser keydown fits. */
export interface KernelKeyEvent extends KeyEventLike {
  preventDefault(): void;
  stopPropagation(): void;
}

const IGNORE = new Set(["Control", "Meta", "Alt", "Shift"]);

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
 * `normalizeEvent` yields for the matching keydown — the pure counterpart, so
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

// ── Types ───────────────────────────────────────────────────────────────────

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
  /** the armed chord prefix, or null when not in chord mode */
  readonly chordPrefix: string | null;
}

// ── Binding lookup (pure) ───────────────────────────────────────────────────

function findBinding(bindings: KeyBindings, normalized: string): KeyHandler | undefined {
  const handler = bindings[normalized];
  if (handler) return handler;
  if (normalized.includes("mod")) return bindings[normalized.replace("mod", "ctrl")];
  if (normalized.includes("ctrl")) return bindings[normalized.replace("ctrl", "mod")];
  return undefined;
}

// ── The instance ────────────────────────────────────────────────────────────

export function createKeyboard(options: KeyboardOptions = {}): Keyboard {
  const layers: KeyLayer[] = [];
  let chordTimeoutMs = options.chordTimeoutMs ?? 2000;
  let activeChord: { prefix: string; timeoutId: ReturnType<typeof setTimeout> } | null = null;
  const chordListeners = new Set<ChordListener>();

  function notifyChord(prefix: string | null): void {
    for (const fn of chordListeners) fn(prefix);
  }

  function exitChordMode(): void {
    if (activeChord) {
      clearTimeout(activeChord.timeoutId);
      activeChord = null;
      notifyChord(null);
    }
  }

  function enterChordMode(prefix: string): void {
    exitChordMode();
    activeChord = {
      prefix,
      timeoutId: setTimeout(() => {
        activeChord = null;
        notifyChord(null);
      }, chordTimeoutMs),
    };
    notifyChord(prefix);
  }

  function isChordPrefix(normalized: string): boolean {
    const prefix = `${normalized} `;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer || layer.options.enabled === false) continue;
      for (const key of Object.keys(layer.bindings)) {
        if (key.startsWith(prefix)) return true;
      }
    }
    return false;
  }

  function handleKeydown(e: KernelKeyEvent): void {
    if (IGNORE.has(e.key)) return;
    const normalized = normalizeEvent(e);

    if (activeChord) {
      const full = `${activeChord.prefix} ${normalized}`;
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer || layer.options.enabled === false) continue;
        const handler = findBinding(layer.bindings, full);
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          exitChordMode();
          handler(e);
          return;
        }
      }
      if (isChordPrefix(full)) {
        e.preventDefault();
        enterChordMode(full);
        return;
      }
      exitChordMode();
      return;
    }

    if (isChordPrefix(normalized)) {
      e.preventDefault();
      enterChordMode(normalized);
      return;
    }

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
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

  function pushLayer(bindings: KeyBindings, layerOptions: KeyLayerOptions = {}): KeyLayer {
    const layer: KeyLayer = {
      id: layerOptions.id ?? `layer-${layers.length}`,
      bindings,
      options: layerOptions,
    };
    if (layerOptions.base) {
      const firstNonBase = layers.findIndex((l) => !l.options.base);
      if (firstNonBase === -1) layers.push(layer);
      else layers.splice(firstNonBase, 0, layer);
    } else {
      layers.push(layer);
    }
    return layer;
  }

  return {
    handleKeydown,
    pushLayer,
    popLayer(layer) {
      const i = layers.indexOf(layer);
      if (i !== -1) layers.splice(i, 1);
    },
    registerShortcuts(nodes, driverOptions) {
      const bindings: KeyBindings = {};
      for (const [shortcut, node] of nodes) {
        bindings[normalizeShortcut(parseShortcut(shortcut))] = () => driverOptions.onActivate(node);
      }
      return pushLayer(bindings, { base: true, id: "kernel-shortcuts" });
    },
    subscribeChordMode(fn) {
      chordListeners.add(fn);
      return () => chordListeners.delete(fn);
    },
    exitChordMode,
    setChordTimeout(ms) {
      chordTimeoutMs = ms;
    },
    get chordPrefix() {
      return activeChord?.prefix ?? null;
    },
  };
}

// ── Conflict detection (pure) ───────────────────────────────────────────────

export interface ShortcutConflict {
  shortcut: string;
  nodeIds: string[];
}

export function validateShortcuts(nodes: Map<string, CommandNode>): ShortcutConflict[] {
  const byKey = new Map<string, string[]>();
  for (const [shortcut, node] of nodes) {
    const parsed = parseShortcut(shortcut);
    const key = [
      parsed.mod && "mod",
      parsed.ctrl && "ctrl",
      parsed.shift && "shift",
      parsed.alt && "alt",
      parsed.key,
    ]
      .filter(Boolean)
      .join("+");
    const existing = byKey.get(key) ?? [];
    existing.push(node.id);
    byKey.set(key, existing);
  }
  return [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([shortcut, nodeIds]) => ({ shortcut, nodeIds }));
}
