import type { ArgSpec, ArgValue, ArgValues } from "./args.js";
import { checkShape } from "./json-shape.js";
import type { CommandNode } from "./types.js";
import { argList } from "./values.js";

/** A text kind's value: a string, or a list of strings. */
function isText(v: ArgValue): boolean {
  return typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"));
}

/**
 * The arg schema — THE KEYSTONE, finally cut.
 *
 * One `ArgSpec[]` per command already drives the palette's arg chips. Here it
 * also becomes (a) a flat, MCP-compatible JSON Schema for an LLM tool's params,
 * and (b) the runtime validation the kernel enforces before a node runs. The
 * deeplink driver (deeplink.ts) reads the same specs. One declaration, every
 * surface — no per-surface duplication.
 *
 * Text kinds are `type: "string"` (`email` carries `format`, `enum` carries `enum`);
 * typed kinds are `number` / `boolean`, and a `json` arg carries its own declared
 * schema. The top level is kept FLAT on purpose -- MCP guidance is that nesting
 * raises an LLM's token cost and parse-error rate.
 */

/**
 * A JSON Schema node: what `toJsonSchema` derives for command args, and what
 * HAND-AUTHORED tool params use (the agent projection's generic navigator tools,
 * which legitimately need an object/array param).
 */
export type JsonSchemaNode =
  | { type: "string"; description?: string; enum?: string[]; format?: string }
  | { type: "number" | "integer" | "boolean"; description?: string }
  | {
      type: "object";
      description?: string;
      properties?: Record<string, JsonSchemaNode>;
      required?: string[];
      additionalProperties?: boolean;
    }
  | { type: "array"; description?: string; items?: JsonSchemaNode };

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ArgError {
  argId: string;
  message: string;
}

// loose, dependency-free email shape — an honesty check, not RFC 5322
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The element schema of a typed kind (number / boolean / json), or null for a text kind. */
function typedElement(a: ArgSpec): JsonSchemaNode | null {
  const description = a.label && a.label !== a.id ? { description: a.label } : {};
  if (a.kind === "number") return { type: "number", ...description };
  if (a.kind === "boolean") return { type: "boolean", ...description };
  if (a.kind === "json") {
    // the declared schema wins; the arg's label still describes it unless the schema does
    if (!a.schema) return { type: "object", ...description };
    return a.schema.description === undefined ? { ...a.schema, ...description } : a.schema;
  }
  return null;
}

function elementProperty(a: ArgSpec): JsonSchemaNode {
  const typed = typedElement(a);
  if (typed) return typed;
  const prop: Extract<JsonSchemaNode, { type: "string" }> = { type: "string" };
  if (a.label && a.label !== a.id) prop.description = a.label;
  if (a.kind === "email") prop.format = "email";
  if (a.kind === "enum" && a.enumValues) prop.enum = a.enumValues.map((o) => o.value);
  // an entity arg's value is the entity id — tell the model what catalog to resolve against
  if (a.entity) {
    const tag = a.entity.constraint ? `${a.entity.type} (${a.entity.constraint})` : a.entity.type;
    prop.description = `${a.label && a.label !== a.id ? `${a.label}: ` : ""}id of a ${tag} — resolve via the ${a.entity.type} catalog`;
  }
  return prop;
}

/** The JSON Schema node for one arg: the element schema, wrapped in an array for `multiple`. */
function argToProperty(a: ArgSpec): JsonSchemaNode {
  const element = elementProperty(a);
  if (a.multiple)
    return {
      type: "array",
      ...(element.description !== undefined && { description: element.description }),
      items: element,
    };
  return element;
}

/** Errors for one value of a typed arg (number / boolean / json), or null for a text kind. */
function typedErrors(a: ArgSpec, v: unknown): string[] | null {
  if (a.kind === "number")
    return typeof v === "number" && Number.isFinite(v) ? [] : [`${a.label} must be a number`];
  if (a.kind === "boolean")
    return typeof v === "boolean" ? [] : [`${a.label} must be true or false`];
  if (a.kind === "json") return checkShape(v, a.schema ?? { type: "object" }, a.id);
  return null;
}

/** The individual values of an arg: the list for a `multiple` arg, else the one value. */
function valuesOf(a: ArgSpec, v: ArgValue | undefined): unknown[] {
  if (v === undefined) return [];
  return a.multiple && Array.isArray(v) ? v : [v];
}

/** Derive the JSON Schema for a node's args (the LLM tool's `inputSchema`). */
export function toJsonSchema(node: CommandNode): JsonSchemaObject {
  const properties: Record<string, JsonSchemaNode> = {};
  const required: string[] = [];
  for (const a of node.args ?? []) {
    properties[a.id] = argToProperty(a);
    if (a.required) required.push(a.id);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/**
 * Validate the PRESENT arg values (format / enum membership / custom `validate`).
 * Missing-required is `missingArgs`'s job and is intentionally not reported here,
 * so `command()` can surface `missing` (the counter) and `errors` (bad values)
 * as distinct things. Returns [] when every present value is valid.
 */
export function validateArgs(node: CommandNode, values: ArgValues): ArgError[] {
  const errors: ArgError[] = [];
  for (const a of node.args ?? []) {
    // typed kinds: check the value's type (and a json value's shape)
    const present = values[a.id];
    if (present !== undefined && typedElement(a)) {
      for (const v of valuesOf(a, present)) {
        for (const message of typedErrors(a, v) ?? []) errors.push({ argId: a.id, message });
      }
      continue;
    }
    // text kinds: a value that is not text is a caller bug worth naming, not coercing
    if (present !== undefined && !isText(present)) {
      errors.push({ argId: a.id, message: `${a.label} must be text` });
      continue;
    }
    // validate each present value (a `multiple` arg holds several)
    for (const raw of argList(present)) {
      const v = raw.trim();
      if (!v) continue; // empty -> covered by required-presence elsewhere

      if (a.kind === "email" && !EMAIL.test(v)) {
        errors.push({ argId: a.id, message: `${a.label} must be a valid email` });
      }
      if (a.kind === "enum" && a.enumValues && !a.enumValues.some((o) => o.value === v)) {
        const allowed = a.enumValues.map((o) => o.value).join(", ");
        errors.push({ argId: a.id, message: `${a.label} must be one of: ${allowed}` });
      }
      if (a.validate) {
        const msg = a.validate(v);
        if (msg) errors.push({ argId: a.id, message: msg });
      }
    }
  }
  return errors;
}
