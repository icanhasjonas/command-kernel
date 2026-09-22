import { setOwn } from "./own.js";
import type { JsonSchemaNode } from "./schema.js";

const NOT_JSON: Record<string, string> = {
  undefined: "undefined",
  function: "a function",
  symbol: "a symbol",
  bigint: "a bigint",
};

/**
 * A plain object: what JSON.parse makes (or one with no prototype). A Date, a Map or
 * a class instance is an object too, but its state lives outside its own keys, so it
 * would sign (and fit) as `{}` while run() received something else.
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Where a value holds something JSON cannot carry: NaN or an infinity, undefined (a
 * list hole included), a function, a symbol, a bigint, a cycle, or an object that is
 * not plain (a Date, a Map, a class instance). JSON.stringify would quietly write
 * such a value as null, `{}` or leave it out, so it would be signed as something
 * other than what runs; the kernel refuses it instead. Own keys only.
 */
export function notJson(value: unknown, path: string, seen = new Set<object>()): string[] {
  if (typeof value === "number")
    return Number.isFinite(value) ? [] : [`${path} must be a finite number`];
  if (typeof value === "string" || typeof value === "boolean" || value === null) return [];
  if (typeof value !== "object") return [`${path} is ${NOT_JSON[typeof value]}, not JSON`];
  if (!Array.isArray(value) && !isPlainObject(value))
    return [`${path} must be a plain JSON object`];
  if (seen.has(value)) return [`${path} contains itself`];
  seen.add(value);
  const out: string[] = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) out.push(...notJson(value[i], `${path}[${i}]`, seen));
  } else {
    const obj = value as Record<string, unknown>; // checked above: a plain object
    for (const k of Object.keys(obj)) out.push(...notJson(obj[k], `${path}.${k}`, seen));
  }
  seen.delete(value);
  return out;
}

/**
 * `v` with every -0 written as 0, at any depth (lists and plain objects). JSON and the
 * text form a grant signs both write -0 as "0", so a -0 that reached run() would be a
 * value the approval never showed. Returns `v` itself when there is none; a cycle is
 * left as it is (validation refuses it).
 */
export function zeroed<T>(v: T, seen = new Set<object>()): T {
  if (typeof v === "number") return (Object.is(v, -0) ? 0 : v) as T;
  if (Array.isArray(v)) {
    if (seen.has(v)) return v;
    seen.add(v);
    const fixed = v.map((x: unknown) => zeroed(x, seen));
    seen.delete(v);
    // Object.is: `0 === -0`, so === would call a fixed -0 unchanged
    return fixed.every((x, i) => Object.is(x, v[i])) ? v : (fixed as T);
  }
  if (!isPlainObject(v) || seen.has(v)) return v;
  seen.add(v);
  const entries = Object.entries(v).map(([k, x]): [string, unknown] => [k, zeroed(x, seen)]);
  seen.delete(v);
  if (entries.every(([k, x]) => Object.is(x, v[k]))) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of entries) setOwn(out, k, x); // "__proto__" stays a key (own.ts)
  return out as T;
}

/**
 * A small structural check of a value against the JsonSchemaNode subset the
 * kernel emits: type (string / number / integer / boolean / object / array),
 * string `enum`, object `properties` + `required` + `additionalProperties: false`,
 * and array `items`. It is deliberately not a full JSON Schema engine: it covers
 * exactly what `toJsonSchema` can say, so what an agent is told and what the
 * kernel enforces cannot drift. Returns one message per problem, each naming the
 * path ("cursor.seq is required").
 */
export function checkShape(value: unknown, schema: JsonSchemaNode, path: string): string[] {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return [`${path} must be text`];
      if (schema.enum && !schema.enum.includes(value))
        return [`${path} must be one of: ${schema.enum.join(", ")}`];
      return [];
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? []
        : [`${path} must be a number`];
    case "integer":
      return Number.isInteger(value) ? [] : [`${path} must be an integer`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path} must be true or false`];
    case "array": {
      if (!Array.isArray(value)) return [`${path} must be a list`];
      const items = schema.items;
      return items ? value.flatMap((v, i) => checkShape(v, items, `${path}[${i}]`)) : [];
    }
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value))
        return [`${path} must be an object`];
      const obj = value as Record<string, unknown>; // checked: a non-null, non-array object
      const props = schema.properties ?? {};
      const out: string[] = [];
      // own keys only: "constructor" or "__proto__" must never resolve through the prototype
      for (const key of schema.required ?? []) {
        if (!Object.hasOwn(obj, key) || obj[key] === undefined)
          out.push(`${path}.${key} is required`);
      }
      for (const [key, v] of Object.entries(obj)) {
        const sub = Object.hasOwn(props, key) ? props[key] : undefined;
        if (sub) out.push(...checkShape(v, sub, `${path}.${key}`));
        else if (schema.additionalProperties === false) out.push(`${path}.${key} is not allowed`);
      }
      return out;
    }
    default:
      return [`${path} has a schema this kernel cannot check`];
  }
}
