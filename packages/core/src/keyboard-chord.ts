/**
 * Chord-mode state for the keyboard driver (keyboard.ts): the armed prefix, its
 * expiry timer, and the listeners a host uses to draw "you pressed `g`, what's
 * next?" hints. Owns no layers and does no dispatch - `keyboard-dispatch.ts`
 * reads `chordPrefix` (and calls `enterChordMode`/`exitChordMode`) to decide
 * what a keystroke does.
 */

import type { ChordListener } from "./keyboard-types.js";

export interface ChordState {
  /** the armed chord prefix, or null when not in chord mode */
  readonly chordPrefix: string | null;
  enterChordMode(prefix: string): void;
  exitChordMode(): void;
  subscribeChordMode(fn: ChordListener): () => void;
  setChordTimeout(ms: number): void;
}

export function createChordState(initialTimeoutMs: number): ChordState {
  let chordTimeoutMs = initialTimeoutMs;
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

  return {
    get chordPrefix() {
      return activeChord?.prefix ?? null;
    },
    enterChordMode,
    exitChordMode,
    subscribeChordMode(fn) {
      chordListeners.add(fn);
      return () => chordListeners.delete(fn);
    },
    setChordTimeout(ms) {
      chordTimeoutMs = ms;
    },
  };
}
