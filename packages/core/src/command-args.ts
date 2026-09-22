import type { ArgOption, ArgValues } from "./args.js";
import type { CommandResponse, Completion } from "./command.js";
import { type EntityRegistry, entityOption } from "./entity.js";
import type { CommandNode, Ctx } from "./types.js";
import { isFilled } from "./values.js";

/**
 * The two arg steps of `command()`: resolving entity-typed args to ids before a
 * run, and listing what each unfilled arg can be (the palette's arg chips, an
 * agent's options). Split out of command.ts so the verb reads top to bottom.
 */

/**
 * Resolve a node's entity-typed args before running: a value that's already a
 * valid entity id passes; a single search match auto-resolves to its id; many
 * matches surface a `disambiguate` response. Returns the response to short-circuit
 * with, or null when every entity arg is resolved (mutating `values` in place).
 */
export async function resolveEntities(
  node: CommandNode,
  values: ArgValues,
  ctx: Ctx,
  entities: EntityRegistry,
): Promise<CommandResponse | null> {
  for (const a of node.args ?? []) {
    if (!a.entity) continue;
    const raw = values[a.id];
    if (typeof raw !== "string") continue; // empty or multi-value (listOf) — handled elsewhere
    const v = raw.trim();
    if (!v) continue;

    if (await entities.get(a.entity.type, v, ctx)) continue; // already a valid id
    const candidates = await entities.search(
      a.entity.type,
      v,
      ctx,
      a.entity.constraint !== undefined ? { constraint: a.entity.constraint } : undefined,
    );
    const exact = candidates.find((c) => c.id === v);
    if (exact) continue;
    if (candidates.length === 1 && candidates[0]) values[a.id] = candidates[0].id;
    else if (candidates.length > 1)
      return { kind: "disambiguate", node, arg: a, query: v, candidates };
  }
  return null;
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
    const filled = isFilled(values[a.id]);
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
