import type { ArgSpec, ArgValue, ArgValues } from "./args.js";
import type { JsonSchemaNode } from "./schema.js";
import type { CommandNode } from "./types.js";

/**
 * Coercion -- how a text-only driver reaches a typed arg.
 *
 * The palette and a deeplink can only produce text. A network RPC or an agent
 * sends real JSON. The kernel accepts both: before validation, each TYPED arg
 * (`number`, `boolean`, `json`) that arrived as text is parsed to its declared
 * type. Text kinds are never touched ("42" stays "42" for a string arg).
 *
 * A `json` arg is coerced by its SCHEMA, not by guessing: a string schema keeps
 * text as text, a number schema parses a number, an array schema accepts one
 * repeated URL key as a one-item list and coerces each element by `items`.
 *
 * Unparseable text is left exactly as it came, so `validateArgs` can say what is
 * wrong with it instead of the value silently becoming NaN, false or 16 (`0x10`
 * is not a number here: only plain decimal notation is). Coercing an
 * already-typed value is a no-op, so running this twice is harmless.
 */

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);
const DECIMAL = /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

function num(t: string): ArgValue {
  const s = t.trim();
  return DECIMAL.test(s) ? Number(s) : t;
}

function bool(t: string): ArgValue {
  const s = t.trim().toLowerCase();
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return t;
}

/** Text to a value of `schema`'s type; text that does not fit is returned unchanged. */
function fromText(schema: JsonSchemaNode, t: string): ArgValue {
  switch (schema.type) {
    case "string":
      return t;
    case "number":
    case "integer":
      return num(t);
    case "boolean":
      return bool(t);
    default: {
      let parsed: ArgValue;
      try {
        parsed = JSON.parse(t) as ArgValue;
      } catch {
        // one URL key (`?ids=a`) is a one-item list of an array schema
        return schema.type === "array" ? shaped(schema, [t]) : t;
      }
      // `?ids=7` against an array schema is the list [7], not the number 7
      if (schema.type === "array" && !Array.isArray(parsed)) return shaped(schema, [t]);
      return shaped(schema, parsed);
    }
  }
}

/** Coerce the text elements of a list against an array schema's `items`. */
function shaped(schema: JsonSchemaNode, v: ArgValue): ArgValue {
  if (schema.type !== "array" || !Array.isArray(v) || !schema.items) return v;
  const items = schema.items;
  return v.map((x) => (typeof x === "string" ? fromText(items, x) : x)) as ArgValue;
}

/** Blank text: an untouched field, or `?n=`. */
const isBlank = (v: unknown) => typeof v === "string" && v.trim() === "";

function coerceOne(spec: ArgSpec, x: ArgValue): ArgValue {
  if (spec.kind === "json") {
    const schema = spec.schema ?? { type: "object" };
    return typeof x === "string" ? fromText(schema, x) : shaped(schema, x);
  }
  if (typeof x === "string") return spec.kind === "number" ? num(x) : bool(x);
  return x;
}

function coerceValue(spec: ArgSpec, v: ArgValue): ArgValue {
  const typed = spec.kind === "number" || spec.kind === "boolean" || spec.kind === "json";
  if (!typed) {
    // a model or an RPC may send 5 or true for a text arg; its text is what it means
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (
      spec.multiple &&
      Array.isArray(v) &&
      v.every((x) => typeof x === "number" || typeof x === "boolean")
    )
      return v.map(String);
    return v;
  }
  // a `multiple` arg holds a list (from a URL: repeated keys, or one text for one item);
  // each item is coerced on its own, blank items are dropped as they are for text
  if (spec.multiple) {
    const items = (Array.isArray(v) ? v : [v]) as ArgValue[];
    return items.filter((x) => !isBlank(x)).map((x) => coerceOne(spec, x)) as ArgValue;
  }
  return coerceOne(spec, v);
}

/** Typed kinds treat blank text as no value, except a json arg whose schema IS text. */
export function blankIsAbsent(spec: ArgSpec): boolean {
  if (spec.kind === "number" || spec.kind === "boolean") return true;
  return spec.kind === "json" && spec.schema?.type !== "string";
}

/** The args with every typed arg parsed from text where possible. Never mutates `values`. */
export function coerceArgs(node: CommandNode, values: ArgValues): ArgValues {
  const specs = node.args;
  if (!specs?.length) return values;
  let out: ArgValues | null = null;
  for (const spec of specs) {
    const v = values[spec.id];
    if (v === undefined) continue;
    // an untouched field or `?n=` means "no value" for a typed arg, as it does for text
    if (typeof v === "string" && v.trim() === "" && blankIsAbsent(spec)) {
      out ??= { ...values };
      delete out[spec.id];
      continue;
    }
    const c = coerceValue(spec, v);
    if (c !== v) {
      out ??= { ...values };
      out[spec.id] = c;
    }
  }
  return out ?? values;
}
