import type { ArgSpec, ArgValue, ArgValues } from "./args.js";
import type { JsonSchemaNode } from "./schema.js";
import type { CommandNode } from "./types.js";

/**
 * Coercion -- one rule for every driver: a value is fitted to its declared type.
 *
 * The palette and a deeplink can only produce text; a network RPC and an agent send
 * JSON, and a model sends `5` where the schema says text. Every arg kind is a JSON
 * schema here (text kinds are `{type:"string"}`, `number` is `{type:"number"}`, a
 * `json` arg carries its own), and `fit` walks value and schema together: text is
 * parsed where the schema wants a number, a boolean, a list or an object; a number
 * or boolean becomes its text where the schema wants text; lists and object
 * properties are fitted item by item. A `multiple` arg is always a list: one value
 * is a list of one, and blank items are dropped.
 *
 * Anything that does not fit is left exactly as it came, so `validateArgs` can say
 * what is wrong instead of the value silently becoming NaN, false or 16 (only plain
 * decimal text is a number: not `0x10`, not `Infinity`). Fitting an already-fitting
 * value is a no-op, so running this twice is harmless.
 */

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);
const DECIMAL = /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const TEXT: JsonSchemaNode = { type: "string" };

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

function parse(t: string): ArgValue | undefined {
  try {
    return JSON.parse(t) as ArgValue; // JSON.parse yields JSON; checked by the caller's schema
  } catch {
    return undefined;
  }
}

const isObject = (v: unknown): v is Record<string, ArgValue> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `v` fitted to `schema` where it can be; otherwise `v` unchanged. */
function fit(schema: JsonSchemaNode, v: ArgValue): ArgValue {
  switch (schema.type) {
    case "string":
      return typeof v === "number" || typeof v === "boolean" ? String(v) : v;
    case "number":
    case "integer":
      return typeof v === "string" ? num(v) : v;
    case "boolean":
      return typeof v === "string" ? bool(v) : v;
    case "array": {
      // text is a JSON list, or else one item (`?ids=7`); any other lone value is one item
      const p = typeof v === "string" ? parse(v) : undefined;
      const list = Array.isArray(v) ? v : Array.isArray(p) ? p : [v];
      const items = schema.items;
      return (items ? list.map((x) => fit(items, x as ArgValue)) : list) as ArgValue;
    }
    case "object": {
      const obj = typeof v === "string" ? parse(v) : v;
      if (!isObject(obj)) return v;
      const props = schema.properties ?? {};
      const out: Record<string, ArgValue> = {};
      for (const [k, x] of Object.entries(obj)) {
        const sub = Object.hasOwn(props, k) ? props[k] : undefined;
        out[k] = sub ? fit(sub, x) : x;
      }
      return out;
    }
    default:
      return v;
  }
}

/** The schema an arg's value (one item, for `multiple`) is fitted to. */
function schemaOf(spec: ArgSpec): JsonSchemaNode {
  if (spec.kind === "number") return { type: "number" };
  if (spec.kind === "boolean") return { type: "boolean" };
  if (spec.kind === "json") return spec.schema ?? { type: "object" };
  return TEXT;
}

const isBlank = (v: unknown) => typeof v === "string" && v.trim() === "";

function coerceValue(spec: ArgSpec, v: ArgValue): ArgValue {
  const schema = schemaOf(spec);
  if (!spec.multiple) return fit(schema, v);
  const items = (Array.isArray(v) ? v : [v]) as ArgValue[];
  return items.filter((x) => !isBlank(x)).map((x) => fit(schema, x)) as ArgValue;
}

/** Typed kinds treat blank text as no value, except a json arg whose schema IS text. */
export function blankIsAbsent(spec: ArgSpec): boolean {
  if (spec.kind === "number" || spec.kind === "boolean") return true;
  return spec.kind === "json" && spec.schema?.type !== "string";
}

/** The args fitted to their declared kinds. Never mutates `values`. */
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
    if (JSON.stringify(c) !== JSON.stringify(v)) {
      out ??= { ...values };
      out[spec.id] = c;
    }
  }
  return out ?? values;
}
