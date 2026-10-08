import type { Ctx } from "./types.js";

/**
 * Entities - SEAM #6, the typed-argument catalog, and the SHAPES they form.
 *
 * The App Intents model, cut to size: an `AppEntity` is a resolved domain object
 * (a Person, a Submission); an `EntityQuery` lists/searches them. Here an
 * `EntityType` is a REGISTERED provider of one kind of object, and an arg can be
 * typed as a reference to it (`ArgSpec.entity = { type: "person" }`) instead of
 * carrying a hand-rolled `complete`. One registration, reused by every command's
 * args, and queryable by an agent.
 *
 * Shapes: a type may `extend` others. A media file IS a file, so a `media-file`
 * goes anywhere a `file` is asked for (an attachment), and a plain file never goes
 * where a `media-file` is asked for (a thumbnailer). The registry is where that
 * is known: `isA` answers it, and asking the `file` catalog for a search or an id
 * also asks every registered shape that extends `file`. A shape with no catalog of
 * its own (no `search`) is abstract: it exists only to be extended.
 *
 * The stored value is still the entity's `id` (a string - keeps `ArgValues` flat
 * and the JSON Schema MCP-friendly); `get(id)` hydrates the full object for
 * `run()`. A `constraint` is an opaque refinement the provider interprets - the
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
  /** the shape it actually is (stamped by the registry): a `file` search can return a `media-file` */
  type?: string;
}

export interface EntitySearchOptions {
  /** opaque refinement the provider interprets, e.g. "with-email-address" */
  constraint?: string;
  /** cap the result count (completion lists are short) */
  limit?: number;
}

/** A registered provider of one kind of entity (the EntityQuery), and its place among the shapes. */
export interface EntityType {
  /** stable type name referenced by an arg, e.g. "person" */
  name: string;
  /** the shapes this one is a kind of: a `media-file` extends `file` */
  extends?: string | readonly string[];
  /** list/search for completion AND agent queries; empty query = list the top. Absent = abstract. */
  search?(query: string, ctx: Ctx, opts?: EntitySearchOptions): Promise<Entity[]>;
  /** hydrate one entity by its id (so run() can read the full object) */
  get?(id: string, ctx: Ctx): Promise<Entity | null>;
  /**
   * A value outside the catalog that still stands for one of these, where an arg is
   * `open` (any well-formed address is someone you can email; "not an email" is not).
   * Absent: an open arg takes any value.
   */
  accepts?(value: string): boolean;
  /** what `accepts` takes, for the refusal: "an address" ("x" is not a person or an address) */
  acceptsLabel?: string;
}

export interface EntityRegistry {
  /** add one or more entity types (chainable) */
  register(...types: EntityType[]): EntityRegistry;
  /** look up a type by name */
  type(name: string): EntityType | undefined;
  /** is a `sub` value acceptable where a `sup` is asked for? Reflexive and transitive. */
  isA(sub: string, sup: string): boolean;
  /** search a shape: its own catalog and every registered shape that extends it ([] if none) */
  search(name: string, query: string, ctx: Ctx, opts?: EntitySearchOptions): Promise<Entity[]>;
  /** hydrate one entity of a shape, or of any shape that extends it (null if none has it) */
  get(name: string, id: string, ctx: Ctx): Promise<Entity | null>;
  /** all registered types */
  list(): EntityType[];
}

/** Two shapes are the same shape: what `isA` means where no registry knows better. */
export const sameShape = (sub: string, sup: string): boolean => sub === sup;

const parentsOf = (t: EntityType | undefined): readonly string[] =>
  t?.extends === undefined ? [] : typeof t.extends === "string" ? [t.extends] : t.extends;

export function createEntityRegistry(...types: EntityType[]): EntityRegistry {
  const map = new Map<string, EntityType>();
  for (const t of types) map.set(t.name, t);

  // walk up from `sub`; a cycle in the declarations stops the walk instead of looping
  const isA = (sub: string, sup: string): boolean => {
    const seen = new Set<string>();
    const up = [sub];
    while (up.length > 0) {
      const at = up.pop() as string;
      if (at === sup) return true;
      if (seen.has(at)) continue;
      seen.add(at);
      up.push(...parentsOf(map.get(at)));
    }
    return false;
  };

  // the shape itself first, then the registered shapes that extend it
  const family = (name: string): EntityType[] => {
    const own = map.get(name);
    const kin = [...map.values()].filter((t) => t.name !== name && isA(t.name, name));
    return own ? [own, ...kin] : kin;
  };

  const stamp = (t: EntityType, e: Entity): Entity => (e.type ? e : { ...e, type: t.name });

  const reg: EntityRegistry = {
    register(...more) {
      for (const t of more) map.set(t.name, t);
      return reg;
    },
    type(name) {
      return map.get(name);
    },
    isA,
    async search(name, query, ctx, opts) {
      const out: Entity[] = [];
      const seen = new Set<string>();
      for (const t of family(name)) {
        if (!t.search) continue;
        for (const e of await t.search(query, ctx, opts)) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          out.push(stamp(t, e));
        }
      }
      return opts?.limit !== undefined ? out.slice(0, opts.limit) : out;
    },
    async get(name, id, ctx) {
      for (const t of family(name)) {
        const found = t.get ? await t.get(id, ctx) : null;
        if (found) return stamp(t, found);
      }
      return null;
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
