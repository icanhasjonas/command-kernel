import type { ArgSpec, ArgValue } from "./args.js";
import { blankIsAbsent } from "./coerce.js";

/**
 * Arg-value helpers. A text arg's value is `string | string[]` (a `multiple` arg
 * holds a list); a typed arg may hold a number, a boolean or JSON. These helpers
 * centralize the single-vs-list handling so the rest of the kernel never branches
 * on `Array.isArray` inline, and every one of them is safe on a typed value.
 */

/** A value as display text: strings as-is, anything else as JSON. */
function asText(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Normalize a value to a list of texts (single -> [single], undefined/null -> []). */
export function argList(v: ArgValue | undefined): string[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v.map(asText) : [asText(v)];
}

/** True when at least one non-blank value is present. `false` and `0` are values. */
export function isFilled(v: ArgValue | undefined): boolean {
  if (typeof v === "number" || typeof v === "boolean") return true;
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return true;
  return argList(v).some((s) => s.trim() !== "");
}

/** Human/display text for a value ("a, b" for a list). */
export function argText(v: ArgValue | undefined): string {
  return argList(v).join(", ");
}

/**
 * Whether an arg has a value, by its kind. A text kind needs non-blank text. A typed
 * kind needs a value, so `0`, `false` and an empty JSON list count; blank text does
 * not (the same rule coercion applies, so `missingArgs` on raw input agrees with
 * `executeNode`). A `multiple` list needs at least one real item.
 */
export function hasValue(spec: ArgSpec, v: ArgValue | undefined): boolean {
  if (spec.kind !== "number" && spec.kind !== "boolean" && spec.kind !== "json") return isFilled(v);
  const present = (x: unknown) =>
    x !== undefined &&
    x !== null &&
    !(typeof x === "string" && x.trim() === "" && blankIsAbsent(spec));
  if (spec.multiple && Array.isArray(v)) return v.some(present);
  return present(v);
}
