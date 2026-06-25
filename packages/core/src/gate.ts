import type { CommandNode, Ctx, GateVerdict } from "./types";

/**
 * The gate — SEAM #2, and the TRUST CORE's first line.
 *
 * A `GatePolicy` answers one question: given this node and this context, is the
 * action allowed, and does it still owe a confirm? This is the SINGLE
 * enforcement point — the palette greys the row, the agent refuses to emit
 * `run`, a deeplink returns a gate — all by calling the same policy. A driver
 * cannot bypass a requirement it never owns. A policy may be sync OR async (hit a
 * DB / flag service); `executeNode` awaits it either way.
 *
 * The default `createRoleGate(ladder)` enforces an ordered role ladder plus an
 * optional confirm flag. `evaluateGate` is that gate over the demo's
 * viewer<advisor<admin ladder. Apps with different roles pass their own ladder,
 * or swap the whole policy for richer rules (ownership, time windows, flags) via
 * `createKernel({ gate })`.
 */
export type GatePolicy = (node: CommandNode, ctx: Ctx) => GateVerdict | Promise<GateVerdict>;

/** Build a gate policy from an ordered role ladder (lowest privilege first). */
export function createRoleGate(ladder: string[]): (node: CommandNode, ctx: Ctx) => GateVerdict {
  const rankOf: Record<string, number> = {};
  ladder.forEach((role, i) => {
    rankOf[role] = i;
  });

  return (node, ctx) => {
    const gate = node.gate;
    if (!gate) return { allowed: true, needsConfirm: false, checks: [] };

    const checks: GateVerdict["checks"] = [];

    if (gate.roles && gate.roles.length > 0) {
      const need = Math.min(...gate.roles.map((r) => rankOf[r] ?? Number.POSITIVE_INFINITY));
      const have = rankOf[ctx.user.role] ?? -1;
      checks.push({ label: `role: ${gate.roles.join(" / ")}`, ok: have >= need });
    }

    if (gate.reason) {
      checks.push({ label: gate.reason, ok: true });
    }

    const allowed = checks.every((c) => c.ok);
    return { allowed, needsConfirm: Boolean(gate.confirm), checks };
  };
}

/** The default gate policy: the demo's viewer < advisor < admin ladder + confirm. */
export const evaluateGate = createRoleGate(["viewer", "advisor", "admin"]);

export function isGated(node: CommandNode): boolean {
  return Boolean(node.gate && (node.gate.roles?.length || node.gate.confirm));
}
