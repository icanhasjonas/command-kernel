import type { EvidenceStore } from "./evidence";
import type { GatePolicy } from "./gate";
import type { PolicyStore } from "./policy";
import { type Ranker, rank } from "./rank";
import { type ArgError, validateArgs } from "./schema";
import type {
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  GateVerdict,
  Grant,
  Ranked,
} from "./types";
import { isFilled } from "./values";

/**
 * The kernel verbs. Renderers (palette, agent, chords) call these — usually via
 * the bound methods on a `Kernel` instance (see create-kernel.ts), occasionally
 * directly. None of them know about React, the DOM, or each other.
 */

/** Rank a node list. Defaults to the stock ranker; pass one to swap the blend. */
export function searchNodes(
  nodes: CommandNode[],
  query: string,
  ctx: Ctx,
  ranker: Ranker = rank,
): Ranked[] {
  return ranker(nodes, query, ctx);
}

export async function resolveChildren(
  node: CommandNode,
  args: ArgValues,
  ctx: Ctx,
): Promise<CommandNode[]> {
  if (!node.resolve) return [];
  return node.resolve(args, ctx);
}

/** The trust-core dependencies `executeNode` enforces against. */
export interface ExecuteDeps {
  gate: GatePolicy;
  policy: PolicyStore;
  evidence: EvidenceStore;
}

export interface ExecuteOutcome {
  verdict: GateVerdict;
  result: CommandResult | null;
  /** the gate said yes but a confirm is still owed before run() fires */
  awaitingConfirm: boolean;
  /** a standing always-allow rule satisfied the confirm (we never asked) */
  autoAllowed: boolean;
  /** present-but-invalid args (bad email/enum/custom); non-empty => did not run */
  argErrors: ArgError[];
}

/**
 * How a renderer proves a confirm-gated command may run. EITHER a `grant` minted
 * by the evidence store when the human/operator clicked Allow (bound to this
 * exact command+args+prior-path), OR — checked first — a standing always-allow
 * rule. A raw boolean is gone on purpose: the agent cannot just assert `true`.
 */
export interface Confirmation {
  grant?: Grant;
  /** canonical key of the path BEFORE this node, the grant's binding context */
  priorKey?: string;
}

/**
 * Execute a node. Order is non-negotiable: gate FIRST, then run. A confirm-gated
 * command runs only when (a) a standing always-allow rule matches, or (b) a
 * valid grant for this exact command+args+prior-path is supplied. Anything
 * else — no grant, a forged grant, a grant for different args, a grant from a
 * rotated session — leaves the confirm owed. The gate, policy, and evidence are
 * INJECTED, so the same enforcement runs whatever a consumer plugged in.
 */
export async function executeNode(
  node: CommandNode,
  args: ArgValues,
  ctx: Ctx,
  deps: ExecuteDeps,
  confirmation: Confirmation = {},
): Promise<ExecuteOutcome> {
  // VALIDATE first — the kernel checks what ANY driver sends, before the gate.
  // A node never runs with a present-but-invalid arg (a hallucinated email/enum).
  const argErrors = validateArgs(node, args);
  if (argErrors.length > 0) {
    return {
      verdict: {
        allowed: false,
        needsConfirm: false,
        checks: argErrors.map((e) => ({ label: e.message, ok: false })),
      },
      result: null,
      awaitingConfirm: false,
      autoAllowed: false,
      argErrors,
    };
  }

  const verdict = await deps.gate(node, ctx);

  if (!verdict.allowed) {
    return { verdict, result: null, awaitingConfirm: false, autoAllowed: false, argErrors: [] };
  }

  let autoAllowed = false;
  if (verdict.needsConfirm) {
    autoAllowed = deps.policy.match(node.id, args) !== null;
    const proven =
      autoAllowed ||
      deps.evidence.verify(confirmation.grant, node.id, args, confirmation.priorKey ?? "");
    if (!proven) {
      return { verdict, result: null, awaitingConfirm: true, autoAllowed: false, argErrors: [] };
    }
  }
  if (!node.run) {
    return { verdict, result: null, awaitingConfirm: false, autoAllowed, argErrors: [] };
  }

  const result = await node.run(args, ctx);
  return { verdict, result, awaitingConfirm: false, autoAllowed, argErrors: [] };
}

/** Flatten a node tree's chord bindings into a lookup for the chord leader. */
export function collectChords(nodes: CommandNode[]): Map<string, CommandNode> {
  const map = new Map<string, CommandNode>();
  for (const n of nodes) {
    if (n.chord) map.set(n.chord.toLowerCase(), n);
  }
  return map;
}

/** Required args still missing a value. Drives the "2 of 3" arg counter. */
export function missingArgs(node: CommandNode, values: ArgValues): string[] {
  return (node.args ?? []).filter((a) => a.required && !isFilled(values[a.id])).map((a) => a.id);
}

export function bumpFrecency(frecency: Record<string, number>, id: string): Record<string, number> {
  return { ...frecency, [id]: (frecency[id] ?? 0) + 1 };
}
