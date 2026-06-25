import { describeNode, type NodeDescriptor } from "./describe";
import { pathKey } from "./evidence";
import { executeNode, missingArgs, resolveChildren } from "./kernel";
import { rank } from "./rank";
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

/**
 * The ONE verb.
 *
 *   command({ path, query, execute, evidence }) => completions | args | gate | result
 *
 * Everything else in the kernel (search / resolve / gate / run) is an
 * implementation detail this single call composes. A path addresses a command
 * chain from the root; each segment can bind args. The call EITHER returns a
 * structured execution result, OR the list of completions for what comes next —
 * exactly the Quicksilver loop, made addressable and renderer-agnostic.
 *
 *   command({ path: [] , query: "user" })                       -> completions
 *   command({ path: [{id:"users"},{id:"users.search"}], query:"jon" }) -> completions
 *   command({ path: [{id:"email.send", args:{...}}], execute: true })  -> result | args | gate
 *
 * Proof that a gated tip may run is the per-segment `evidence` (a grant) carried
 * ON the path's tip segment — minted by the gate when the human/operator clicked
 * Allow, bound to that exact command+args+prior-path. The palette supplies it
 * from the human; the agent supplies it from the operator's Allow. Same gate,
 * same grant shape, no second code path. `role` is the principal for the whole
 * walk (an elevated token), separate from per-act evidence.
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
  | { kind: "args"; node: CommandNode; missing: string[]; items: Completion[] }
  | { kind: "gate"; node: CommandNode; verdict: GateVerdict }
  | { kind: "result"; node: CommandNode; result: CommandResult };

async function argCompletions(
  node: CommandNode,
  values: ArgValues,
  ctx: Ctx,
): Promise<Completion[]> {
  const out: Completion[] = [];
  for (const a of node.args ?? []) {
    if (a.positional) continue;
    const filled = Boolean(values[a.id]?.trim());
    let options: ArgOption[] = [];
    if (!filled) {
      if (a.enumValues) options = a.enumValues;
      else if (a.complete) options = await a.complete("", ctx);
    }
    out.push({ kind: "arg", arg: a, options, filled });
  }
  return out;
}

export async function command(
  roots: CommandNode[],
  req: CommandRequest,
  ctx: Ctx,
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
    const missing = missingArgs(tip, values);
    if (missing.length > 0) {
      return { kind: "args", node: tip, missing, items: await argCompletions(tip, values, ectx) };
    }
    // the grant on the tip segment is bound to everything before it
    const segments = req.path ?? [];
    const tipSeg = segments[segments.length - 1];
    const priorKey = pathKey(segments.slice(0, -1));
    const outcome = await executeNode(tip, values, ectx, { grant: tipSeg?.evidence, priorKey });
    if (!outcome.verdict.allowed || outcome.awaitingConfirm) {
      return { kind: "gate", node: tip, verdict: outcome.verdict };
    }
    if (outcome.result) return { kind: "result", node: tip, result: outcome.result };
  }

  // otherwise COMPLETE — rank the children/roots at the tip, each item carrying
  // its self-description so an agent can navigate the result without guessing.
  const items: Completion[] = rank(level, req.query ?? "", ectx).map((r) => ({
    kind: "command",
    node: r.node,
    score: r.score,
    positions: r.positions,
    descriptor: describeNode(r.node),
  }));
  return { kind: "completions", at: tip, items };
}
