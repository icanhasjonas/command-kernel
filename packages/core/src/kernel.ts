import type { ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { bindingKey, type EvidenceStore } from "./evidence.js";
import type { GatePolicy } from "./gate.js";
import type { PolicyStore } from "./policy.js";
import { type Ranker, rank } from "./rank.js";
import { type ArgError, validateArgs } from "./schema.js";
import { signingArgs } from "./signing.js";
import type { CommandNode, CommandResult, Ctx, GateVerdict, Grant, Ranked } from "./types.js";
import { hasValue } from "./values.js";

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
  /**
   * Who a grant is bound to, read from the ctx that mints it and the ctx that
   * spends it. `createKernel` defaults it to `ctx.user.id`; absent (raw deps), or
   * returning undefined, a grant binds no principal.
   */
  principalOf?: (ctx: Ctx) => string | undefined;
}

/** How far `executeNode` goes. */
export interface ExecuteMode {
  /** evaluate args and the gate, then stop: run() never fires and no grant is checked */
  dryRun?: boolean;
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
  /** required args with no value; non-empty => did not run */
  missing: string[];
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

/** An outcome where run() did not fire; `extra` names why. */
function stopped(verdict: GateVerdict, extra: Partial<ExecuteOutcome> = {}): ExecuteOutcome {
  const base = {
    result: null,
    awaitingConfirm: false,
    autoAllowed: false,
    argErrors: [],
    missing: [],
  };
  return { verdict, ...base, ...extra };
}

/**
 * Execute a node. Order is non-negotiable: args COMPLETE and VALID first, then
 * gate, then run. A confirm-gated command runs only when (a) a standing
 * always-allow rule matches, or (b) a valid grant for this exact
 * command+args+prior-path is supplied. Anything else — no grant, a forged grant,
 * a grant for different args, a grant from a rotated session — leaves the confirm
 * owed. The gate, policy, and evidence are INJECTED, so the same enforcement runs
 * whatever a consumer plugged in.
 *
 * The arg contract is enforced HERE, not in the caller: a driver that calls this
 * verb directly (the palette does) can no more run a command with a missing
 * required arg than with an invalid one.
 */
export async function executeNode(
  node: CommandNode,
  input: ArgValues,
  ctx: Ctx,
  deps: ExecuteDeps,
  confirmation: Confirmation = {},
  mode: ExecuteMode = {},
): Promise<ExecuteOutcome> {
  // typed args sent as text (palette, URL) become their declared type; a no-op otherwise
  const args = coerceArgs(node, input);

  // COMPLETE first — a required arg with no value is not a runnable command.
  const missing = missingArgs(node, args);
  if (missing.length > 0) {
    const labels = new Map((node.args ?? []).map((a) => [a.id, a.label]));
    const checks = missing.map((id) => ({
      label: `${labels.get(id) ?? id} is required`,
      ok: false,
    }));
    return stopped({ allowed: false, needsConfirm: false, checks }, { missing });
  }

  // VALIDATE next — the kernel checks what ANY driver sends, before the gate.
  // A node never runs with a present-but-invalid arg (a hallucinated email/enum).
  const argErrors = validateArgs(node, args);
  if (argErrors.length > 0) {
    const checks = argErrors.map((e) => ({ label: e.message, ok: false }));
    return stopped({ allowed: false, needsConfirm: false, checks }, { argErrors });
  }

  const verdict = await deps.gate(node, ctx, args);
  if (!verdict.allowed) return stopped(verdict);
  // a dry run reports what the gate owes and stops here, whatever proof came along
  if (mode.dryRun) return stopped(verdict, { awaitingConfirm: verdict.needsConfirm });

  let autoAllowed = false;
  if (verdict.needsConfirm) {
    autoAllowed = deps.policy.match(node.id, args) !== null;
    // verify over the canonical signing form, so a grant minted from the palette's
    // text ("yes") verifies the same act arriving typed (true) and vice versa; and
    // for THIS principal, so a grant minted for someone else never verifies
    const proven =
      autoAllowed ||
      deps.evidence.verify(
        confirmation.grant,
        node.id,
        signingArgs(node, args),
        bindingKey(deps.principalOf?.(ctx), confirmation.priorKey ?? ""),
      );
    if (!proven) return stopped(verdict, { awaitingConfirm: true });
  }
  if (!node.run) return stopped(verdict, { autoAllowed });

  const result = await node.run(args, ctx);
  return { verdict, result, awaitingConfirm: false, autoAllowed, argErrors: [], missing: [] };
}

/** Flatten a node tree's chord bindings into a lookup for the chord leader. */
export function collectChords(nodes: CommandNode[]): Map<string, CommandNode> {
  const map = new Map<string, CommandNode>();
  for (const n of nodes) {
    if (n.chord) map.set(n.chord.toLowerCase(), n);
  }
  return map;
}

/**
 * Nodes that carry a `shortcut`, filtered by `when(ctx)`, keyed by the shortcut
 * string. NOTE: this is a lookup, so two nodes on the SAME shortcut collapse to
 * the last one — use `shortcutNodes` + `validateShortcuts` (or
 * `kernel.shortcutConflicts(ctx)`) to see the collision before it silently eats
 * a binding.
 */
export function collectShortcuts(nodes: CommandNode[], ctx: Ctx): Map<string, CommandNode> {
  const map = new Map<string, CommandNode>();
  for (const n of shortcutNodes(nodes, ctx)) map.set(n.shortcut as string, n);
  return map;
}

/** Every visible node that declares a `shortcut` — duplicates INCLUDED. */
export function shortcutNodes(nodes: CommandNode[], ctx: Ctx): CommandNode[] {
  return nodes.filter((n) => n.shortcut && (!n.when || n.when(ctx)));
}

/** Required args still missing a value. Drives the "2 of 3" arg counter. */
export function missingArgs(node: CommandNode, values: ArgValues): string[] {
  return (node.args ?? []).filter((a) => a.required && !hasValue(a, values[a.id])).map((a) => a.id);
}

export function bumpFrecency(frecency: Record<string, number>, id: string): Record<string, number> {
  return { ...frecency, [id]: (frecency[id] ?? 0) + 1 };
}
