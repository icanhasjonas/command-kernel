import type { ArgSpec, ArgValues, CommandNode } from "./types";
import { argList } from "./values";

/**
 * The arg schema — THE KEYSTONE, finally cut.
 *
 * One `ArgSpec[]` per command already drives the palette's arg chips. Here it
 * also becomes (a) a flat, MCP-compatible JSON Schema for an LLM tool's params,
 * and (b) the runtime validation the kernel enforces before a node runs. The
 * deeplink driver (deeplink.ts) reads the same specs. One declaration, every
 * surface — no per-surface duplication.
 *
 * Values are strings (`ArgValues = Record<string,string>`), so every property is
 * `type: "string"`; `email` carries `format`, `enum` carries `enum`. Schemas are
 * kept FLAT on purpose — MCP guidance is that nesting raises an LLM's token cost
 * and parse-error rate.
 */

export interface JsonSchemaProperty {
  type: "string";
  description?: string;
  enum?: string[];
  format?: "email";
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: false;
}

/**
 * A permissive JSON Schema node — for HAND-AUTHORED tool params (the agent
 * projection's generic navigator tools, which legitimately need an object/array
 * param). The strict `JsonSchema` above (all-string, for derived command args)
 * is a subtype of `JsonSchemaObject`.
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

function elementProperty(a: ArgSpec): JsonSchemaProperty {
  const prop: JsonSchemaProperty = { type: "string" };
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
    // validate each present value (a `multiple` arg holds several)
    for (const raw of argList(values[a.id])) {
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
