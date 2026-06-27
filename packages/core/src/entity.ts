import type { Ctx } from "./types";

/**
 * Entities — SEAM #6, the typed-argument catalog.
 *
 * The App Intents model, cut to size: an `AppEntity` is a resolved domain object
 * (a Person, a Submission); an `EntityQuery` lists/searches them. Here an
 * `EntityType` is a REGISTERED provider of one kind of object, and an arg can be
 * typed as a reference to it (`ArgSpec.entity = { type: "person" }`) instead of
 * carrying a hand-rolled `complete`. One registration, reused by every command's
 * args, and queryable by an agent.
 *
 * The stored value is still the entity's `id` (a string — keeps `ArgValues` flat
 * and the JSON Schema MCP-friendly); `get(id)` hydrates the full object for
 * `run()`. A `constraint` is an opaque refinement the provider interprets — the
 * runtime form of `Person<'with-email-address'>`.
 */

export interface Entity {
  /** the value stored in ArgValues when this entity is chosen */
  id: string;
  /** human label for the option / chip */
  label: string;
  /** secondary line (email, role, ...) */
  hint?: string;
  /** lucide icon name */
  icon?: string;
  /** the full domain object, for run() to use after resolution */
  data?: unknown;
}

export interface EntitySearchOptions {
  /** opaque refinement the provider interprets, e.g. "with-email-address" */
  constraint?: string;
  /** cap the result count (completion lists are short) */
  limit?: number;
}

/** A registered provider of one kind of entity (the EntityQuery). */
export interface EntityType {
  /** stable type name referenced by an arg, e.g. "person" */
  name: string;
  /** list/search for completion AND agent queries; empty query = list the top */
  search(query: string, ctx: Ctx, opts?: EntitySearchOptions): Promise<Entity[]>;
  /** hydrate one entity by its id (so run() can read the full object) */
  get?(id: string, ctx: Ctx): Promise<Entity | null>;
}

export interface EntityRegistry {
  /** add one or more entity types (chainable) */
  register(...types: EntityType[]): EntityRegistry;
  /** look up a type by name */
  type(name: string): EntityType | undefined;
  /** search a type (returns [] for an unknown type) */
  search(name: string, query: string, ctx: Ctx, opts?: EntitySearchOptions): Promise<Entity[]>;
  /** hydrate one entity (null for an unknown type or missing get) */
  get(name: string, id: string, ctx: Ctx): Promise<Entity | null>;
  /** all registered types */
  list(): EntityType[];
}

export function createEntityRegistry(...types: EntityType[]): EntityRegistry {
  const map = new Map<string, EntityType>();
  for (const t of types) map.set(t.name, t);

  const reg: EntityRegistry = {
    register(...more) {
      for (const t of more) map.set(t.name, t);
      return reg;
    },
    type(name) {
      return map.get(name);
    },
    async search(name, query, ctx, opts) {
      const t = map.get(name);
      return t ? t.search(query, ctx, opts) : [];
    },
    async get(name, id, ctx) {
      const t = map.get(name);
      return t?.get ? t.get(id, ctx) : null;
    },
    list() {
      return [...map.values()];
    },
  };
  return reg;
}

/** Map an entity to an arg-completion option (value = id). */
export function entityOption(e: Entity): {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
} {
  return {
    value: e.id,
    label: e.label,
    ...(e.hint !== undefined && { hint: e.hint }),
    ...(e.icon !== undefined && { icon: e.icon }),
  };
}
