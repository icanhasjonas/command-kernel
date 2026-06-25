import { isGated } from "./gate";
import type {
  ArgKind,
  ArgSpec,
  CommandNode,
  Ctx,
  EffectMode,
  EntityRef,
  EnumerateMode,
  Gate,
} from "./types";

/**
 * Self-description — the layer that lets an AGENT navigate the command tree
 * WITHOUT guessing.
 *
 * `command({ path: [] })` returns the root taxonomy; every item carries a
 * `NodeDescriptor` that answers, in machine-readable form:
 *   - what is this? (title + summary)
 *   - can I drill into it, and is that FREE or does it hit a backend? (navigable
 *     + enumerate)
 *   - can I run it, and does running it CHANGE anything? (executable + effect)
 *   - what args does it take, and how are values offered? (args)
 *   - what does the gate require? (gate)
 *   - is it safe to eagerly enumerate for context? (safeToScout)
 *
 * So a scouting agent knows it can freely walk the static branches to build
 * context, must supply a search term before enumerating a "query" branch, and
 * must never run a "writes" leaf without going through the gate.
 */

export interface ArgDescriptor {
  id: string;
  label: string;
  kind: ArgKind;
  required: boolean;
  positional: boolean;
  /** how values are offered: a closed enum, a typed entity catalog, an async lookup, or free text */
  options: "enum" | "entity" | "async" | "free";
  /** when options === "entity", the type + constraint an agent queries to resolve a value */
  entity?: EntityRef;
}

export interface NodeDescriptor {
  id: string;
  title: string;
  summary?: string;
  /** can you drill INTO it (list children)? */
  navigable: boolean;
  /** enumeration cost when navigable; null otherwise */
  enumerate: EnumerateMode | null;
  /** can you EXECUTE it? */
  executable: boolean;
  /** execution effect when executable; null otherwise */
  effect: EffectMode | null;
  args: ArgDescriptor[];
  gate: Pick<Gate, "roles" | "confirm" | "reason"> | null;
  /** safe to eagerly enumerate for context (navigable + free, no backend hit) */
  safeToScout: boolean;
}

/** Enumeration cost of resolve(): explicit, else inferred from a positional arg. */
export function enumerateMode(node: CommandNode): EnumerateMode | null {
  if (!node.resolve) return null;
  if (node.enumerate) return node.enumerate;
  return node.args?.some((a) => a.positional) ? "query" : "free";
}

/** Execution effect of run(): explicit, else inferred from the gate. */
export function effectMode(node: CommandNode): EffectMode | null {
  if (!node.run) return null;
  if (node.effect) return node.effect;
  return isGated(node) ? "writes" : "pure";
}

function describeArg(a: ArgSpec): ArgDescriptor {
  return {
    id: a.id,
    label: a.label,
    kind: a.kind,
    required: Boolean(a.required),
    positional: Boolean(a.positional),
    options: a.enumValues ? "enum" : a.entity ? "entity" : a.complete ? "async" : "free",
    entity: a.entity,
  };
}

/** The machine-readable self-description of a single node. */
export function describeNode(node: CommandNode): NodeDescriptor {
  const enumerate = enumerateMode(node);
  return {
    id: node.id,
    title: node.title,
    summary: node.summary ?? node.subtitle,
    navigable: Boolean(node.resolve),
    enumerate,
    executable: Boolean(node.run),
    effect: effectMode(node),
    args: (node.args ?? []).map(describeArg),
    gate: node.gate
      ? { roles: node.gate.roles, confirm: node.gate.confirm, reason: node.gate.reason }
      : null,
    safeToScout: enumerate === "free",
  };
}

/**
 * The self-describing taxonomy at a level (the root when given ROOTS). Respects
 * each node's `when()` against the context so an agent only sees what applies.
 */
export function describeTree(nodes: CommandNode[], ctx?: Ctx): NodeDescriptor[] {
  const visible = ctx ? nodes.filter((n) => !n.when || n.when(ctx)) : nodes;
  return visible.map(describeNode);
}
