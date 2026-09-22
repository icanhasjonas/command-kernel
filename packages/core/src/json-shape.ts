import type { JsonSchemaNode } from "./schema.js";

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
