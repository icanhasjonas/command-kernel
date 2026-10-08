import { textOf } from "@command-kernel/agent";
import type { ArgValues, CommandNode, Ctx, EntityRegistry } from "@command-kernel/core";

/**
 * Two things the toy keyword matcher (`pickTool`) cannot do, done here so the demo's
 * agent stays honest: refuse to swap a destructive goal for a harmless tool that
 * happened to share a word, and fill a person arg from a name in the goal. A real
 * model does both by itself; everything after the pick is the same either way.
 */

const DESTRUCTIVE = /\b(delete|remove|drop|destroy|wipe|purge|erase)\b/i;

/** The destructive verb in the goal that the picked tool does not do, if any. */
export function verbItCannotDo(goal: string, node: CommandNode): string | null {
  const verb = goal.match(DESTRUCTIVE)?.[1]?.toLowerCase();
  if (!verb) return null;
  const says = [node.title, node.summary ?? "", ...(node.keywords ?? [])].join(" ").toLowerCase();
  return says.includes(verb) ? null : verb;
}

/**
 * Fill each still-empty entity arg from a word of the goal that names exactly one
 * entity ("email ada" -> ada@analytical.engine), through the same catalog the palette
 * searches. An ambiguous word fills nothing: asking beats guessing. Only a required arg
 * is filled: "a welcome note" does not attach launch-notes.md to an email.
 */
export async function fillFromNames(
  goal: string,
  node: CommandNode,
  values: ArgValues,
  entities: EntityRegistry | null,
  ctx: Ctx,
): Promise<ArgValues> {
  if (!entities) return values;
  const out = { ...values };
  const named: string[] = [];
  const titleWords = new Set(node.title.toLowerCase().split(/\s+/));
  const words = goal
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !titleWords.has(w));
  for (const arg of node.args ?? []) {
    if (arg.kind !== "entity" || !arg.entity || !arg.required || out[arg.id] !== undefined)
      continue;
    for (const w of words) {
      const hits = await entities.search(arg.entity.type, w, ctx, { limit: 2 });
      if (hits.length === 1 && hits[0]) {
        out[arg.id] = hits[0].id;
        named.push(w);
        break;
      }
    }
  }
  // a name that filled a person is not part of the message: "email ada about X" says X
  if (named.length > 0)
    for (const arg of node.args ?? [])
      if (arg.kind === "text" && out[arg.id] !== undefined) {
        const text = textOf(goal, node, named);
        if (text) out[arg.id] = text;
        else delete out[arg.id];
      }
  return out;
}
