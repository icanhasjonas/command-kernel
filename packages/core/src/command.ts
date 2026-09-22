import type { ArgOption, ArgSpec, ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { argCompletions, resolveEntities } from "./command-args.js";
import { describeNode, type NodeDescriptor } from "./describe.js";
import type { Entity, EntityRegistry } from "./entity.js";
import { type Hop, hopsKey } from "./hops-key.js";
import { type ExecuteDeps, executeNode, missingArgs, resolveChildren } from "./kernel.js";
import type { Ranker } from "./rank.js";
import type { ArgError } from "./schema.js";
import type { CommandNode, CommandResult, Ctx, GateVerdict, PathSegment, Role } from "./types.js";

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
  /**
   * With `execute`: check args and the gate exactly as a run would, but never run.
   * The answer is `args` / `disambiguate`, or `gate`, whose verdict says whether a
   * confirm is owed (`needsConfirm: false` = this would simply run).
   */
  dryRun?: boolean;
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
  | {
      kind: "gate";
      node: CommandNode;
      verdict: GateVerdict;
      /**
       * The EFFECTIVE args this node will run with — the segment's args after
       * `prefill` merging and entity auto-resolution. A grant must be minted over
       * THESE (with `priorKey`), not over what the caller typed, or verification
       * fails against values the kernel derived. `kernel.grantFor(res)` does it.
       */
      args: ArgValues;
      /** canonical key of the path BEFORE this node — the grant's binding context */
      priorKey: string;
      /** who asked (`principalOf(ctx)`): the grant is bound to them; absent = nobody */
      principal?: string;
    }
  | { kind: "result"; node: CommandNode; result: CommandResult };

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

  // walk the path, resolving children at each hop. Every hop's args are coerced to
  // their declared kinds (resolve() sees 5, not "5"), and each hop is keyed in its
  // canonical signing form, so every driver computes the same binding context.
  let level = roots;
  let tip: CommandNode | null = null;
  let values: ArgValues = {};
  const walked: Hop[] = [];
  for (const seg of req.path ?? []) {
    const node = level.find((n) => n.id === seg.id);
    if (!node) return { kind: "completions", at: tip, items: [] };
    tip = node;
    walked.push({ node, args: seg.args ?? {} });
    values = coerceArgs(node, { ...(node.prefill ? node.prefill(ectx) : {}), ...(seg.args ?? {}) });
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
    const priorKey = hopsKey(walked.slice(0, -1));
    const outcome = await executeNode(
      tip,
      values,
      ectx,
      deps,
      { ...(tipSeg?.evidence !== undefined && { grant: tipSeg.evidence }), priorKey },
      { dryRun: Boolean(req.dryRun) },
    );
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
    if (!outcome.verdict.allowed || outcome.awaitingConfirm || req.dryRun) {
      // hand back the EFFECTIVE args + binding context (path and principal) so the
      // approving driver mints a grant the kernel will actually verify
      const principal = deps.principalOf?.(ectx);
      return {
        kind: "gate",
        node: tip,
        verdict: outcome.verdict,
        args: values,
        priorKey,
        ...(principal !== undefined && { principal }),
      };
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
