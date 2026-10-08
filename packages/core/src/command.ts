import type { ArgValues } from "./args.js";
import { argCompletions, resolveEntities } from "./command-args.js";
import type { CommandDeps, CommandRequest, CommandResponse, Completion } from "./command-types.js";
import { describeNode } from "./describe.js";
import { type Hop, hopArgs, hopsKey } from "./hops-key.js";
import { executeNode, missingArgs, resolveChildren } from "./kernel.js";
import { bindInput } from "./pipe.js";
import type { CommandNode, Ctx } from "./types.js";

export type {
  CommandDeps,
  CommandRequest,
  CommandResponse,
  Completion,
} from "./command-types.js";

/**
 * The ONE verb.
 *
 *   command(roots, { path, query, execute, role }, ctx, deps)
 *     => completions | args | gate | result
 *
 * Everything else in the kernel (search / resolve / gate / run) is an
 * implementation detail this single call composes. A path addresses a command
 * chain from the root; each segment can bind args. The call EITHER returns a
 * structured execution result, OR the list of completions for what comes next -
 * exactly the Quicksilver loop, made addressable and renderer-agnostic.
 *
 *   command(roots, { path: [] , query: "user" })                       -> completions
 *   command(roots, { path: [{id:"users"},{id:"users.search"}], query:"jon" }) -> completions
 *   command(roots, { path: [{id:"email.send", args:{...}}], execute: true })  -> result | args | gate
 *
 * Proof that a gated tip may run is the per-segment `evidence` (a grant) carried
 * ON the path's tip segment - minted by the evidence store when the
 * human/operator clicked Allow, bound to that exact command+args+prior-path. The
 * palette supplies it from the human; the agent supplies it from the operator's
 * Allow. Same gate, same grant shape, no second code path. `role` is the
 * principal for the whole walk (an elevated token), separate from per-act
 * evidence.
 *
 * `deps` injects the ranker + the trust core (gate / policy / evidence). Callers
 * usually reach `command` through a `Kernel` instance, which binds `deps` for
 * them (create-kernel.ts). The request and response shapes are in
 * command-types.ts.
 */

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

  // walk the path, resolving children at each hop. Each hop resolves with its
  // prefill overlaid by the segment's args, coerced to their declared kinds (resolve()
  // sees 5, not "5"), and is keyed by exactly those args: the children a hop hands out
  // depend on all of them, so a grant must too (hopArgs, shared with the palette).
  // A piped `input` is bound into the tip's written args, under them prefill.
  let level = roots;
  let tip: CommandNode | null = null;
  let values: ArgValues = {};
  const walked: Hop[] = [];
  const segs = req.path ?? [];
  for (const [i, seg] of segs.entries()) {
    const node = level.find((n) => n.id === seg.id);
    if (!node) return { kind: "completions", at: tip, items: [] };
    tip = node;
    let written = seg.args;
    if (req.input && i === segs.length - 1) {
      const bound = bindInput(node, seg.args ?? {}, req.input, deps.entities?.isA);
      if ("error" in bound) {
        const items = await argCompletions(
          node,
          hopArgs(node, seg.args, ectx),
          ectx,
          deps.entities,
        );
        return { kind: "args", node, missing: [], errors: [bound.error], items };
      }
      written = bound.values;
    }
    values = hopArgs(node, written, ectx);
    walked.push({ node, args: values });
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
    const tipSeg = segs[segs.length - 1];
    const priorKey = hopsKey(walked.slice(0, -1));
    const outcome = await executeNode(
      tip,
      values,
      ectx,
      deps,
      {
        ...(tipSeg?.evidence !== undefined && { grant: tipSeg.evidence }),
        ...(req.spend !== undefined && { spend: req.spend }),
        priorKey,
      },
      { dryRun: Boolean(req.dryRun) },
    );
    // the kernel validated inside executeNode - surface bad values as `args`
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
        now: deps.now ? deps.now() : Date.now(),
      };
    }
    if (outcome.result) return { kind: "result", node: tip, result: outcome.result };
  }

  // otherwise COMPLETE - rank the children/roots at the tip, each item carrying
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
