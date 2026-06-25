import type { CommandNode, Ctx, GateVerdict } from "./types";

const ROLE_RANK: Record<string, number> = { viewer: 0, advisor: 1, admin: 2 };

/**
 * Evaluate a node's declared gate against the current context. This is the
 * SINGLE enforcement point: the palette greys the row, the agent adapter
 * refuses to emit `run`, deeplinks 403 — all by calling this. The renderer
 * cannot bypass a requirement it never owns.
 */
export function evaluateGate(node: CommandNode, ctx: Ctx): GateVerdict {
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
}

export function isGated(node: CommandNode): boolean {
  return Boolean(node.gate && (node.gate.roles?.length || node.gate.confirm));
}
