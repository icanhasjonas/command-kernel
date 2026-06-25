import type { ArgValues, CommandNode } from "./types";

/**
 * Always-allow — the kernel-side standing policy.
 *
 * The grant (evidence.ts) is the per-ACT proof. "Always allow" is the standing
 * exception: when the human picks it, the kernel records a rule and from then on
 * a matching gate is satisfied WITHOUT asking and WITHOUT a grant. It is checked
 * BEFORE evidence is ever requested — a separate short-circuit into the same
 * verdict.
 *
 * Scope vocabulary — how wide the "always" reaches:
 *   - command : this command, any args ("always allow Send email")
 *   - arg     : this command + one arg equals a value ("…to jon@wall.north")
 *   - prefix  : this command + one arg starts with a prefix ("…under forms/ip/")
 *
 * Session-scoped: the rule list is in-memory and dies on reload, exactly like
 * the salt. "Always" means "always, for this session" — same mental model as
 * an editor's allow prompt. Persisting it would mean localStorage, on purpose,
 * later.
 */

export type AllowScope =
  | { kind: "command" }
  | { kind: "arg"; argId: string; value: string }
  | { kind: "prefix"; argId: string; prefix: string };

export interface AllowRule {
  commandId: string;
  scope: AllowScope;
}

let rules: AllowRule[] = [];

function sameRule(a: AllowRule, b: AllowRule): boolean {
  return a.commandId === b.commandId && JSON.stringify(a.scope) === JSON.stringify(b.scope);
}

export function allowAlways(rule: AllowRule): void {
  if (!rules.some((r) => sameRule(r, rule))) rules = [...rules, rule];
}

export function revokeAllow(rule: AllowRule): void {
  rules = rules.filter((r) => !sameRule(r, rule));
}

export function listAllowRules(): AllowRule[] {
  return rules;
}

export function clearAllowRules(): void {
  rules = [];
}

/** The matching rule that auto-satisfies this command+args, or null. */
export function matchingAllow(commandId: string, args: ArgValues): AllowRule | null {
  for (const r of rules) {
    if (r.commandId !== commandId) continue;
    const s = r.scope;
    if (s.kind === "command") return r;
    if (s.kind === "arg" && args[s.argId] === s.value) return r;
    if (s.kind === "prefix" && (args[s.argId] ?? "").startsWith(s.prefix)) return r;
  }
  return null;
}

/**
 * Pick a sensible "always allow" scope for a node + the args being run: bind to
 * the entity/email arg when there is one (so "always allow" means "for THIS
 * recipient"), otherwise the whole command.
 */
export function ruleForNode(node: CommandNode, args: ArgValues): AllowRule {
  const ent = node.args?.find(
    (a) => (a.kind === "email" || a.kind === "entity") && args[a.id]?.trim(),
  );
  if (ent) {
    return {
      commandId: node.id,
      scope: { kind: "arg", argId: ent.id, value: args[ent.id] as string },
    };
  }
  return { commandId: node.id, scope: { kind: "command" } };
}

/** Human-readable scope label for the Always-allow button. */
export function allowLabel(rule: AllowRule): string {
  if (rule.scope.kind === "arg") return `Always allow for ${rule.scope.value}`;
  if (rule.scope.kind === "prefix") return `Always allow under ${rule.scope.prefix}`;
  return "Always allow this command";
}
