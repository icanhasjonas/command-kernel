/**
 * The arg vocabulary: what a command's args can be, and what their values are.
 * One `ArgSpec[]` per command is the keystone every driver reads (see schema.ts).
 */

import type { JsonSchemaNode } from "./schema.js";
import type { Ctx } from "./types.js";

/**
 * The kinds an arg can be. The first five are TEXT kinds: their value is a string
 * (or a list of strings for `multiple`). `number`, `boolean` and `json` are TYPED
 * kinds for drivers that carry real JSON (a network RPC, an agent). A text-only
 * driver (the palette, a deeplink) may still send them as text: the kernel coerces
 * "42" / "true" / '{"a":1}' to the declared type before validating (coerce.ts).
 */
export type ArgKind =
  | "string"
  | "email"
  | "enum"
  | "entity"
  | "text"
  | "number"
  | "boolean"
  | "json";

/** Any JSON value. A `json` arg holds one; its shape is checked against `ArgSpec.schema`. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ArgOption {
  value: string;
  label: string;
  hint?: string;
  /** lucide icon name */
  icon?: string;
}

/**
 * A reference from an arg to a registered entity TYPE (see entity.ts), with an
 * optional opaque constraint -- the runtime form of `Person<'with-email-address'>`.
 * The arg's value is the chosen entity's id; the registered `EntityType` is the
 * completion source and the agent-queryable catalog.
 */
export interface EntityRef {
  /** the registered entity type name, e.g. "person" */
  type: string;
  /** opaque refinement the entity provider interprets, e.g. "with-email-address" */
  constraint?: string;
}

export interface ArgSpec {
  id: string;
  label: string;
  kind: ArgKind;
  required?: boolean;
  /** the single Quicksilver "direct object" arg, typed inline after the title */
  positional?: boolean;
  placeholder?: string;
  enumValues?: ArgOption[];
  /**
   * Reference to a registered entity type. When set, the entity registry is the
   * completion source (no hand-rolled `complete` needed) and an agent can query
   * the same catalog. Resolution order for options: enumValues -> entity -> complete.
   */
  entity?: EntityRef;
  /**
   * accept many values (listOf<X>): the value becomes a `string[]` of ids/values.
   * A grant binds the ORDER of a `json` list (order is part of what was approved);
   * every other kind's list is a set, and its order does not change the grant.
   */
  multiple?: boolean;
  /** async, arg-scoped value completion (one-off; entity is the registered path) */
  complete?: (query: string, ctx: Ctx) => Promise<ArgOption[]>;
  /** return an error string, or null when valid (text kinds; called once per value) */
  validate?: (value: string) => string | null;
  /**
   * For a `json` arg: the JSON Schema its value must satisfy. Checked by
   * `validateArgs` and emitted as-is by `toJsonSchema`, so the agent's tool params
   * and the runtime check are the same declaration. Omitted = any object.
   */
  schema?: JsonSchemaNode;
}

/**
 * One arg's value. Text kinds hold a string, or a list of strings for `multiple`.
 * Typed kinds hold a number, a boolean, a list of those, or (for `json`) any JSON
 * value except a bare null (an absent arg is simply not in the bag).
 */
export type ArgValue = Exclude<JsonValue, null>;

export type ArgValues = Record<string, ArgValue>;
