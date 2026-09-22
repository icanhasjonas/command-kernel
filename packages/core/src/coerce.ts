import type { ArgSpec, ArgValue, ArgValues } from "./args.js";
import { isPlainObject, zeroed } from "./json-shape.js";
import { getOwn, setOwn } from "./own.js";
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

/** A plain object only: a Date or a Map is left as it came, for validation to refuse. */
const isObject = (v: unknown): v is Record<string, ArgValue> => isPlainObject(v);

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
        setOwn(out, k, sub ? fit(sub, x) : x); // "__proto__" stays a key (own.ts)
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

/** `v` fitted to its spec, with -0 written as 0 (it would sign as "0" and run as -0). */
function coerceValue(spec: ArgSpec, v: ArgValue): ArgValue {
  const schema = schemaOf(spec);
  if (!spec.multiple) return zeroed(fit(schema, v));
  const items = (Array.isArray(v) ? v : [v]) as ArgValue[];
  return zeroed(items.filter((x) => !isBlank(x)).map((x) => fit(schema, x)) as ArgValue);
}

/** No value at all: blank text for a typed kind, or a `multiple` list with no items. */
function absent(spec: ArgSpec, v: ArgValue): boolean {
  if (spec.multiple && Array.isArray(v) && v.length === 0) return true;
  return typeof v === "string" && v.trim() === "" && blankIsAbsent(spec);
}

/** Typed kinds treat blank text as no value, except a json arg whose schema IS text. */
export function blankIsAbsent(spec: ArgSpec): boolean {
  if (spec.kind === "number" || spec.kind === "boolean") return true;
  return spec.kind === "json" && spec.schema?.type !== "string";
}

/** Deep equality over JSON-shaped values (no JSON.stringify: a bigint would throw). */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (!isObject(a) || !isObject(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
  );
}

/** `values` without its undefined entries (an undefined value is no value). */
function withoutUndefined(values: ArgValues): ArgValues {
  const keys = Object.keys(values);
  if (keys.every((k) => values[k] !== undefined)) return values;
  const out: ArgValues = {};
  for (const k of keys) {
    const v = values[k];
    if (v !== undefined) setOwn(out, k, v);
  }
  return out;
}

/**
 * The args fitted to their declared kinds. Never mutates `values`. A key whose value
 * is undefined is dropped first, declared or not: `{ note: undefined }` is `{}` to the
 * gate, the signature and run() alike, never a second spelling of `{ note: "" }`. So
 * is a `multiple` arg left with no items (`[]`, or only blanks): every driver hands
 * run() the same absent value, where a URL could never carry an empty list at all.
 */
export function coerceArgs(node: CommandNode, input: ArgValues): ArgValues {
  const values = withoutUndefined(input);
  const specs = node.args;
  if (!specs?.length) return values;
  let out: ArgValues | null = null;
  for (const spec of specs) {
    const v = getOwn(values, spec.id);
    if (v === undefined) continue;
    const c = coerceValue(spec, v);
    // an untouched field or `?n=` means "no value" for a typed arg, as it does for text
    if (absent(spec, v) || absent(spec, c)) {
      out ??= { ...values };
      delete out[spec.id];
      continue;
    }
    if (!same(c, v)) {
      out ??= { ...values };
      setOwn(out, spec.id, c);
    }
  }
  return out ?? values;
}
