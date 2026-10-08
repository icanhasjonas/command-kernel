import type { ArgKind, ArgSpec, EntityRef, Piped, ValueType } from "./args.js";
import { isGated } from "./gate.js";
import type { JsonSchemaNode } from "./schema.js";
import type { CommandNode, Ctx, EffectMode, EnumerateMode, Gate } from "./types.js";

/**
 * Self-description - the layer that lets an AGENT navigate the command tree
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
  /** the value is a list */
  multiple: boolean;
  /** for a `json` arg: the JSON Schema its value must satisfy */
  schema?: JsonSchemaNode;
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
  /** what a run hands on to the next command of a pipe (its result's `value`) */
  output?: ValueType;
  /** the arg a piped value lands in, when the node names one */
  input?: string;
  /** the value this node stands for, which can be piped into a command */
  subject?: Piped;
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
  return declaredEffect(node);
}

/**
 * The effect a node declares, `run` or not (a shared wire declaration has none):
 * its `effect`, else "writes" when it is gated and "pure" when it is not.
 */
export function declaredEffect(node: Pick<CommandNode, "effect" | "gate">): EffectMode {
  return node.effect ?? (isGated(node) ? "writes" : "pure");
}

function describeArg(a: ArgSpec): ArgDescriptor {
  return {
    id: a.id,
    label: a.label,
    kind: a.kind,
    required: Boolean(a.required),
    positional: Boolean(a.positional),
    options: a.enumValues ? "enum" : a.entity ? "entity" : a.complete ? "async" : "free",
    ...(a.entity !== undefined && { entity: a.entity }),
    multiple: Boolean(a.multiple),
    ...(a.schema !== undefined && { schema: a.schema }),
  };
}

/** The machine-readable self-description of a single node. */
export function describeNode(node: CommandNode): NodeDescriptor {
  const enumerate = enumerateMode(node);
  return {
    id: node.id,
    title: node.title,
    ...((node.summary ?? node.subtitle) !== undefined && {
      summary: node.summary ?? node.subtitle,
    }),
    navigable: Boolean(node.resolve),
    enumerate,
    executable: Boolean(node.run),
    effect: effectMode(node),
    args: (node.args ?? []).map(describeArg),
    gate: node.gate ? { ...node.gate } : null,
    safeToScout: enumerate === "free",
    ...(node.output !== undefined && { output: node.output }),
    ...(node.input !== undefined && { input: node.input }),
    ...(node.subject !== undefined && { subject: node.subject }),
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
