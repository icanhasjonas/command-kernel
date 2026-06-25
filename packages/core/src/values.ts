import type { ArgValue } from "./types";

/**
 * Arg-value helpers. An arg value is `string | string[]` (a `multiple` arg holds
 * a list). These three functions centralize the single-vs-list handling so the
 * rest of the kernel never branches on `Array.isArray` inline.
 */

/** Normalize a value to a list (single -> [single], undefined -> []). */
export function argList(v: ArgValue | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** True when at least one non-blank value is present. */
export function isFilled(v: ArgValue | undefined): boolean {
  return argList(v).some((s) => s.trim() !== "");
}

/** Human/display text for a value ("a, b" for a list). */
export function argText(v: ArgValue | undefined): string {
  return argList(v).join(", ");
}
