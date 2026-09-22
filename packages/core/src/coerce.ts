import type { ArgSpec, ArgValue, ArgValues, CommandNode } from "./types.js";

/**
 * Coercion -- how a text-only driver reaches a typed arg.
 *
 * The palette and a deeplink can only produce text. A network RPC or an agent
 * sends real JSON. The kernel accepts both: before validation, each TYPED arg
 * (`number`, `boolean`, `json`) that arrived as text is parsed to its declared
 * type. Text kinds are never touched ("42" stays "42" for a string arg).
 *
 * Unparseable text is left exactly as it came, so `validateArgs` can say what is
 * wrong with it instead of the value silently becoming NaN or false. Coercing an
 * already-typed value is a no-op, so running this twice is harmless -- the kernel
 * does it in `command()` (so a `gate` response hands back the coerced args a grant
 * must bind to) and again in `executeNode` (for drivers that call it directly).
 */

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

function one(kind: ArgSpec["kind"], v: ArgValue): ArgValue {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (kind === "number") {
    const n = Number(t);
    return t !== "" && Number.isFinite(n) ? n : v;
  }
  if (kind === "boolean") {
    const lower = t.toLowerCase();
    if (TRUE.has(lower)) return true;
    if (FALSE.has(lower)) return false;
    return v;
  }
  if (kind === "json") {
    try {
      return JSON.parse(t) as ArgValue;
    } catch {
      return v;
    }
  }
  return v;
}

function coerceValue(spec: ArgSpec, v: ArgValue): ArgValue {
  if (spec.kind !== "number" && spec.kind !== "boolean" && spec.kind !== "json") return v;
  // a `multiple` number arg arrives from a URL as a list of texts
  if (spec.multiple && Array.isArray(v))
    return v.map((x) => one(spec.kind, x as ArgValue)) as ArgValue;
  return one(spec.kind, v);
}

/** The args with every typed arg parsed from text where possible. Never mutates `values`. */
export function coerceArgs(node: CommandNode, values: ArgValues): ArgValues {
  const specs = node.args;
  if (!specs?.length) return values;
  let out: ArgValues | null = null;
  for (const spec of specs) {
    const v = values[spec.id];
    if (v === undefined) continue;
    const c = coerceValue(spec, v);
    if (c !== v) {
      out ??= { ...values };
      out[spec.id] = c;
    }
  }
  return out ?? values;
}
