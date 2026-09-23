/**
 * The one canonical form of a shortcut string, the form every layer is keyed by and every press is
 * compared in (law L10). Built on `normalizeShortcut`, so a binding and the press that matches it
 * normalize to the same string.
 */

import { normalizeShortcut } from "./keyboard-normalize.js";
import { isKnownKeyName, parseShortcut } from "./shortcut.js";

/**
 * A shortcut in the dispatcher's own dialect, chord steps apart: `G i` -> `g i`. A literal space
 * (`" "`, as `KeyboardEvent.key` spells it, or `shift+ `) is the Space key, not a separator.
 */
export function canonicalBinding(shortcut: string): string {
  const spaced = shortcut === " " ? "Space" : shortcut.replace(/\+ $/, "+Space");
  return spaced.trim().split(/\s+/).map(canonicalStep).join(" ");
}

/**
 * One chord step. `parseShortcut` lower-cases the key (its public contract), which loses the only
 * spelling a named key outside the alias table can match: `Insert`, `PrintScreen`,
 * `MediaPlayPause` as `KeyboardEvent.key` spells them. So the key is taken as WRITTEN, and
 * `canonicalKey` folds the ones it knows (`esc`, `ENTER`, `k`).
 */
function canonicalStep(step: string): string {
  const parsed = parseShortcut(step);
  const written = parsed.key === "+" ? "+" : step.slice(step.length - parsed.key.length);
  // a lower-case name the alias table does not know can match no press (`KeyboardEvent.key`
  // spells named keys in PascalCase): say so now, rather than bind a key that never fires
  // counted in characters, not UTF-16 units: an emoji is one key
  if ([...written].length > 1 && written === written.toLowerCase() && !isKnownKeyName(written)) {
    throw new Error(
      `keyboard: "${written}" is not a key name this kernel knows; spell it the way a ` +
        "browser key event does (MediaPlayPause, AudioVolumeUp)",
    );
  }
  return normalizeShortcut({ ...parsed, key: written });
}
