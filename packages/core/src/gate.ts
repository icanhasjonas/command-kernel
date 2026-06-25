import type { CommandNode, Ctx, GateVerdict } from "./types";

/**
 * The gate — SEAM #2, and the TRUST CORE's first line.
 *
 * A `GatePolicy` answers one question: given this node and this context, is the
 * action allowed, and does it still owe a confirm? This is the SINGLE
 * enforcement point — the palette greys the row, the agent refuses to emit
 * `run`, a deeplink 403s — all by calling the same policy. A driver cannot
 * bypass a requirement it never owns.
 *
 * The default `evaluateGate` enforces a viewer < advisor < admin role ladder
 * plus an optional confirm flag. Apps with different roles or richer rules
 * (ownership, time windows, feature flags) supply their own `GatePolicy` to
 * `createKernel({ gate })`. It must be a PURE function of (node, ctx).
 */
export type GatePolicy = (node: CommandNode, ctx: Ctx) => GateVerdict;

const ROLE_RANK: Record<string, number> = { viewer: 0, advisor: 1, admin: 2 };

/** The default gate policy: a viewer < advisor < admin role ladder + confirm. */
export const evaluateGate: GatePolicy = (node, ctx) => {
  const gate = node.gate;
  if (!gate) return { allowed: true, needsConfirm: false, checks: [] };

  const checks: GateVerdict["checks"] = [];

  if (gate.roles && gate.roles.length > 0) {
    const need = Math.min(...gate.roles.map((r) => ROLE_RANK[r] ?? 99));
    const have = ROLE_RANK[ctx.user.role] ?? -1;
    checks.push({
      label: `role: ${gate.roles.join(" / ")}`,
      ok: have >= need,
    });
  }

  if (gate.reason) {
    checks.push({ label: gate.reason, ok: true });
  }

  const allowed = checks.every((c) => c.ok);
  return { allowed, needsConfirm: Boolean(gate.confirm), checks };
};

export function isGated(node: CommandNode): boolean {
  return Boolean(node.gate && (node.gate.roles?.length || node.gate.confirm));
}
