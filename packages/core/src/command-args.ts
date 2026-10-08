import type { ArgOption, ArgValues, EntityRef } from "./args.js";
import type { CommandResponse, Completion } from "./command.js";
import { type Entity, type EntityRegistry, entityOption } from "./entity.js";
import { getOwn, setOwn } from "./own.js";
import type { ArgError } from "./schema.js";
import type { CommandNode, Ctx } from "./types.js";
import { isFilled } from "./values.js";

/**
 * The two arg steps of `command()`: resolving entity-typed args to ids before a
 * run, and listing what each unfilled arg can be (the palette's arg chips, an
 * agent's options). Split out of command.ts so the verb reads top to bottom.
 */

type Found = { id: string } | { many: Entity[] } | { none: true };

/** One value against its entity type: an id, the one search match, several, or none. */
async function findEntity(
  ref: EntityRef,
  v: string,
  ctx: Ctx,
  entities: EntityRegistry,
): Promise<Found> {
  if (await entities.get(ref.type, v, ctx)) return { id: v }; // already a valid id
  const candidates = await entities.search(
    ref.type,
    v,
    ctx,
    ref.constraint !== undefined ? { constraint: ref.constraint } : undefined,
  );
  if (candidates.some((c) => c.id === v)) return { id: v };
  if (candidates.length === 1 && candidates[0]) return { id: candidates[0].id };
  if (candidates.length > 1) return { many: candidates };
  return { none: true };
}

/**
 * Why a value no entity has is refused, or null when the arg takes it: an `open` arg
 * takes it if its type accepts that kind of value (or says nothing about it).
 */
function refusedFree(ref: EntityRef, v: string, entities: EntityRegistry): string | null {
  if (!ref.open) return `no ${ref.type} matches "${v}"`;
  const type = entities.type(ref.type);
  if (!type?.accepts || type.accepts(v)) return null;
  return `"${v}" is not a ${ref.type}${type.acceptsLabel ? ` or ${type.acceptsLabel}` : ""}`;
}

/**
 * Resolve a node's entity-typed args before running: a value that's already a
 * valid entity id passes; a single search match auto-resolves to its id; many
 * matches surface a `disambiguate` response; no match is an arg error, unless the
 * arg is `open` (it takes a value typed by hand). Every value of a `multiple` arg
 * is checked the same way; one with several matches is an error there, since a
 * list has no single pick to ask for. Returns the response to short-circuit with,
 * or null when every entity arg is resolved (mutating `values` in place).
 */
export async function resolveEntities(
  node: CommandNode,
  values: ArgValues,
  ctx: Ctx,
  entities: EntityRegistry,
): Promise<CommandResponse | null> {
  const refuse = async (argId: string, message: string): Promise<CommandResponse> => ({
    kind: "args",
    node,
    missing: [],
    errors: [{ argId, message }],
    items: await argCompletions(node, values, ctx, entities),
  });
  for (const a of node.args ?? []) {
    if (!a.entity) continue;
    const raw = getOwn(values, a.id);
    const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
    const out: string[] = [];
    for (const item of list) {
      const v = typeof item === "string" ? item.trim() : "";
      if (!v) continue;
      const found = await findEntity(a.entity, v, ctx, entities);
      if ("id" in found) out.push(found.id);
      else if (a.entity.open) {
        const why = refusedFree(a.entity, v, entities);
        if (why) return refuse(a.id, why);
        out.push(v);
      } else if ("many" in found) {
        if (!Array.isArray(raw))
          return { kind: "disambiguate", node, arg: a, query: v, candidates: found.many };
        return refuse(a.id, `"${v}" matches several ${a.entity.type}s`);
      } else return refuse(a.id, `no ${a.entity.type} matches "${v}"`);
    }
    if (Array.isArray(raw)) setOwn(values, a.id, out);
    else if (out[0] !== undefined) setOwn(values, a.id, out[0]);
  }
  return null;
}

/**
 * The check the lower verb (`executeNode`) makes, so no driver skips it: every value
 * of a closed entity arg is the id of an entity that exists. Names were turned into
 * ids before this (`resolveEntities`, or a pick from the arg's options); here an id
 * that is nobody is an arg error. An `open` arg takes a value its type accepts.
 */
export async function unknownEntities(
  node: CommandNode,
  values: ArgValues,
  ctx: Ctx,
  entities: EntityRegistry,
): Promise<ArgError[]> {
  const errors: ArgError[] = [];
  for (const a of node.args ?? []) {
    if (!a.entity) continue;
    const raw = getOwn(values, a.id);
    const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const item of list) {
      const v = typeof item === "string" ? item.trim() : "";
      if (!v || (await entities.get(a.entity.type, v, ctx))) continue;
      const why = refusedFree(a.entity, v, entities);
      if (!why) continue;
      errors.push({ argId: a.id, message: why });
      break;
    }
  }
  return errors;
}

export async function argCompletions(
  node: CommandNode,
  values: ArgValues,
  ctx: Ctx,
  entities?: EntityRegistry,
): Promise<Completion[]> {
  const out: Completion[] = [];
  for (const a of node.args ?? []) {
    if (a.positional) continue;
    const filled = isFilled(getOwn(values, a.id));
    let options: ArgOption[] = [];
    if (!filled) {
      // resolution order: closed enum -> registered entity catalog -> one-off complete
      if (a.enumValues) options = a.enumValues;
      else if (a.entity && entities) {
        const found = await entities.search(
          a.entity.type,
          "",
          ctx,
          a.entity.constraint !== undefined ? { constraint: a.entity.constraint } : undefined,
        );
        options = found.map(entityOption);
      } else if (a.complete) options = await a.complete("", ctx);
    }
    out.push({ kind: "arg", arg: a, options, filled });
  }
  return out;
}
