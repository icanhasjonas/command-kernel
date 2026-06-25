import { describeNode, type NodeDescriptor } from "./describe";
import { type Entity, type EntityRegistry, entityOption } from "./entity";
import { pathKey } from "./evidence";
import { type ExecuteDeps, executeNode, missingArgs, resolveChildren } from "./kernel";
import type { Ranker } from "./rank";
import type { ArgError } from "./schema";
import type {
  ArgOption,
  ArgSpec,
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  GateVerdict,
  PathSegment,
  Role,
} from "./types";
import { isFilled } from "./values";

/**
 * The ONE verb.
 *
 *   command(roots, { path, query, execute, role }, ctx, deps)
 *     => completions | args | gate | result
 *
 * Everything else in the kernel (search / resolve / gate / run) is an
 * implementation detail this single call composes. A path addresses a command
 * chain from the root; each segment can bind args. The call EITHER returns a
 * structured execution result, OR the list of completions for what comes next —
 * exactly the Quicksilver loop, made addressable and renderer-agnostic.
 *
 *   command(roots, { path: [] , query: "user" })                       -> completions
 *   command(roots, { path: [{id:"users"},{id:"users.search"}], query:"jon" }) -> completions
 *   command(roots, { path: [{id:"email.send", args:{...}}], execute: true })  -> result | args | gate
 *
 * Proof that a gated tip may run is the per-segment `evidence` (a grant) carried
 * ON the path's tip segment — minted by the evidence store when the
 * human/operator clicked Allow, bound to that exact command+args+prior-path. The
 * palette supplies it from the human; the agent supplies it from the operator's
 * Allow. Same gate, same grant shape, no second code path. `role` is the
 * principal for the whole walk (an elevated token), separate from per-act
 * evidence.
 *
 * `deps` injects the ranker + the trust core (gate / policy / evidence). Callers
 * usually reach `command` through a `Kernel` instance, which binds `deps` for
 * them — see create-kernel.ts.
 */

export interface CommandRequest {
  /** addressed chain from the root; empty/omitted = the root menu */
  path?: PathSegment[];
  /** partial text to rank completions at the tip */
  query?: string;
  /** attempt to run the tip instead of browsing into it */
  execute?: boolean;
  /** principal override for the whole walk (e.g. an elevated token) */
  role?: Role;
}

/** What `command` needs wired in: the ranker, the trust core, and entities. */
export interface CommandDeps extends ExecuteDeps {
  ranker: Ranker;
  /** the entity catalog backing entity-typed args (optional) */
  entities?: EntityRegistry;
}

export type Completion =
  | {
      kind: "command";
      node: CommandNode;
      score: number;
      positions: number[];
      descriptor: NodeDescriptor;
    }
  | { kind: "arg"; arg: ArgSpec; options: ArgOption[]; filled: boolean };

export type CommandResponse =
  | { kind: "completions"; at: CommandNode | null; items: Completion[] }
  | { kind: "args"; node: CommandNode; missing: string[]; errors: ArgError[]; items: Completion[] }
  | { kind: "disambiguate"; node: CommandNode; arg: ArgSpec; query: string; candidates: Entity[] }
  | { kind: "gate"; node: CommandNode; verdict: GateVerdict }
  | { kind: "result"; node: CommandNode; result: CommandResult };

/**
 * Resolve a node's entity-typed args before running: a value that's already a
 * valid entity id passes; a single search match auto-resolves to its id; many
 * matches surface a `disambiguate` response. Returns the response to short-circuit
 * with, or null when every entity arg is resolved (mutating `values` in place).
 */
async function resolveEntities(
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
    const candidates = await entities.search(a.entity.type, v, ctx, {
      constraint: a.entity.constraint,
    });
    const exact = candidates.find((c) => c.id === v);
    if (exact) continue;
    if (candidates.length === 1 && candidates[0]) values[a.id] = candidates[0].id;
    else if (candidates.length > 1)
      return { kind: "disambiguate", node, arg: a, query: v, candidates };
  }
  return null;
}

async function argCompletions(
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
        const found = await entities.search(a.entity.type, "", ctx, {
          constraint: a.entity.constraint,
        });
        options = found.map(entityOption);
      } else if (a.complete) options = await a.complete("", ctx);
    }
    out.push({ kind: "arg", arg: a, options, filled });
  }
  return out;
}

export async function command(
  roots: CommandNode[],
  req: CommandRequest,
  ctx: Ctx,
  deps: CommandDeps,
): Promise<CommandResponse> {
  // an elevated principal (a token) can stand in for the session role
  const ectx: Ctx =
    req.role && req.role !== ctx.user.role
      ? { ...ctx, user: { ...ctx.user, role: req.role } }
      : ctx;

  // walk the path, resolving children at each hop
  let level = roots;
  let tip: CommandNode | null = null;
  let values: ArgValues = {};
  for (const seg of req.path ?? []) {
    const node = level.find((n) => n.id === seg.id);
    if (!node) return { kind: "completions", at: tip, items: [] };
    tip = node;
    values = { ...(node.prefill ? node.prefill(ectx) : {}), ...(seg.args ?? {}) };
    level = node.resolve ? await resolveChildren(node, values, ectx) : [];
  }

  // EXECUTE the tip
  if (req.execute && tip) {
    // resolve entity-typed args: auto-resolve a single match, disambiguate on many
    if (deps.entities) {
      const dis = await resolveEntities(tip, values, ectx, deps.entities);
      if (dis) return dis;
    }
    // missing required args -> collect them (the "2 of 3" counter) before running
    const missing = missingArgs(tip, values);
    if (missing.length > 0) {
      return {
        kind: "args",
        node: tip,
        missing,
        errors: [],
        items: await argCompletions(tip, values, ectx, deps.entities),
      };
    }
    // the grant on the tip segment is bound to everything before it
    const segments = req.path ?? [];
    const tipSeg = segments[segments.length - 1];
    const priorKey = pathKey(segments.slice(0, -1));
    const outcome = await executeNode(tip, values, ectx, deps, {
      grant: tipSeg?.evidence,
      priorKey,
    });
    // the kernel validated inside executeNode — surface bad values as `args`
    if (outcome.argErrors.length > 0) {
      return {
        kind: "args",
        node: tip,
        missing: [],
        errors: outcome.argErrors,
        items: await argCompletions(tip, values, ectx, deps.entities),
      };
    }
    if (!outcome.verdict.allowed || outcome.awaitingConfirm) {
      return { kind: "gate", node: tip, verdict: outcome.verdict };
    }
    if (outcome.result) return { kind: "result", node: tip, result: outcome.result };
  }

  // otherwise COMPLETE — rank the children/roots at the tip, each item carrying
  // its self-description so an agent can navigate the result without guessing.
  const items: Completion[] = deps.ranker(level, req.query ?? "", ectx).map((r) => ({
    kind: "command",
    node: r.node,
    score: r.score,
    positions: r.positions,
    descriptor: describeNode(r.node),
  }));
  return { kind: "completions", at: tip, items };
}
