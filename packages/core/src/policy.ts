import type { ArgValues, CommandNode } from "./types";
import { argList, isFilled } from "./values";

/**
 * Policy — SEAM #4, the standing-exception half of the TRUST CORE.
 *
 * The grant (evidence.ts) is the per-ACT proof. "Always allow" is the standing
 * exception: when the human picks it, the store records a rule and from then on
 * a matching gate is satisfied WITHOUT asking and WITHOUT a grant. It is checked
 * BEFORE evidence is ever requested — a separate short-circuit into the verdict.
 *
 * Scope vocabulary — how wide the "always" reaches:
 *   - command : this command, any args ("always allow Send email")
 *   - arg     : this command + one arg equals a value ("…to jon@wall.north")
 *   - prefix  : this command + one arg starts with a prefix ("…under forms/ip/")
 *
 * A `PolicyStore` owns the rule list. The default `createMemoryPolicyStore()`
 * keeps it in memory on the INSTANCE and dies with the session, exactly like the
 * salt — "always" means "always, for this session." Back it with localStorage or
 * a server by implementing this interface and passing `createKernel({ policy })`.
 */

export type AllowScope =
  | { kind: "command" }
  | { kind: "arg"; argId: string; value: string }
  | { kind: "prefix"; argId: string; prefix: string };

export interface AllowRule {
  commandId: string;
  scope: AllowScope;
}

export interface PolicyStore {
  /** Record a standing always-allow rule (idempotent). */
  allow(rule: AllowRule): void;
  /** Drop a standing rule. */
  revoke(rule: AllowRule): void;
  /** All standing rules. */
  list(): AllowRule[];
  /** Drop every rule (what "new session" does). */
  clear(): void;
  /** The matching rule that auto-satisfies this command+args, or null. */
  match(commandId: string, args: ArgValues): AllowRule | null;
}

function sameRule(a: AllowRule, b: AllowRule): boolean {
  return a.commandId === b.commandId && JSON.stringify(a.scope) === JSON.stringify(b.scope);
}

/** The default policy store: an in-memory, per-instance, session-scoped rule list. */
export function createMemoryPolicyStore(): PolicyStore {
  let rules: AllowRule[] = [];
  return {
    allow(rule) {
      if (!rules.some((r) => sameRule(r, rule))) rules = [...rules, rule];
    },
    revoke(rule) {
      rules = rules.filter((r) => !sameRule(r, rule));
    },
    list() {
      return rules;
    },
    clear() {
      rules = [];
    },
    match(commandId, args) {
      for (const r of rules) {
        if (r.commandId !== commandId) continue;
        const s = r.scope;
        if (s.kind === "command") return r;
        if (s.kind === "arg" && argList(args[s.argId]).includes(s.value)) return r;
        if (s.kind === "prefix" && argList(args[s.argId]).some((v) => v.startsWith(s.prefix)))
          return r;
      }
      return null;
    },
  };
}

/**
 * Pick a sensible "always allow" scope for a node + the args being run: bind to
 * the entity/email arg when there is one (so "always allow" means "for THIS
 * recipient"), otherwise the whole command. Pure helper — no store needed.
 */
export function ruleForNode(node: CommandNode, args: ArgValues): AllowRule {
  const ent = node.args?.find(
    (a) => (a.kind === "email" || a.kind === "entity") && isFilled(args[a.id]),
  );
  if (ent) {
    return {
      commandId: node.id,
      scope: { kind: "arg", argId: ent.id, value: argList(args[ent.id])[0] ?? "" },
    };
  }
  return { commandId: node.id, scope: { kind: "command" } };
}

/** Human-readable scope label for the Always-allow button. Pure helper. */
export function allowLabel(rule: AllowRule): string {
  if (rule.scope.kind === "arg") return `Always allow for ${rule.scope.value}`;
  if (rule.scope.kind === "prefix") return `Always allow under ${rule.scope.prefix}`;
  return "Always allow this command";
}
