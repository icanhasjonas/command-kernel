import type {
  CommandRequest,
  CommandResponse,
  ExecuteOutcome,
  Grant,
  Kernel,
} from "@command-kernel/core";
import { runPipe } from "@command-kernel/core";
import { type Driver, type GrantState, traceStore } from "./trace-store";

/**
 * Grants on this page are single-use, as on the lab's server: one approval runs one
 * call. Every tap shares this set, because every tap is the same kernel.
 */
const spent = new Set<string>();
const spend = (g: Grant) => {
  if (spent.has(g.nonce)) return false;
  spent.add(g.nonce);
  return true;
};

/**
 * A driver's tap on the ONE kernel: the same instance, the same gate, evidence and
 * policy, with every executing call written to the trace rail. It decides nothing but
 * one page-wide rule, that a grant is spent once used; otherwise it only watches what
 * the kernel answered. `pipe` is rebuilt on the tapped `command`, so each step of a
 * pipe lands in the rail as its own call.
 */
export function tap(
  kernel: Kernel,
  driver: Driver,
  /** this driver hands an approval it cannot give to the palette, whose call is then the entry */
  opts: { handsOverGates?: boolean; handsOverArgs?: boolean } = {},
): Kernel {
  const command: Kernel["command"] = async (req, ctx, roots) => {
    const res = await kernel.command(
      req.execute ? { ...req, spend: req.spend ?? spend } : req,
      ctx,
      roots,
    );
    // the palette takes over an owed approval (or, for a link, args still to collect or
    // fix): its own call is the one entry, so the hand-off is not logged twice
    const handedOver =
      (opts.handsOverGates && res.kind === "gate" && res.verdict.allowed) ||
      (opts.handsOverArgs && res.kind === "args");
    if (req.execute && !handedOver) {
      const entry = fromResponse(driver, req, res);
      // a run with no grant that a standing rule covers: say the rule let it through, as
      // executeNode's own `autoAllowed` does for the palette (command() does not carry it)
      const ruled =
        res.kind === "result" &&
        entry.grant === "none" &&
        kernel.policy.match(res.node.id, entry.args) !== null;
      traceStore.record(ruled ? { ...entry, grant: "policy" } : entry);
    }
    return res;
  };
  return {
    ...kernel,
    command,
    pipe: (req, ctx) => runPipe((r) => command(r, ctx), req, kernel.isA),
    // the gate asked early (before the args) and said no: that refusal is a call the
    // person made, so it lands in the rail like any other; a yes is not a call yet
    preflight: async (node, ctx, args) => {
      const verdict = await kernel.preflight(node, ctx, args);
      if (!verdict.allowed)
        traceStore.record({
          driver,
          command: node.id,
          title: node.title,
          args: args ?? {},
          outcome: "blocked",
          checks: verdict.checks,
          problems: [],
          grant: "none",
        });
      return verdict;
    },
    executeNode: async (node, args, ctx, confirmation) => {
      const once = confirmation && { ...confirmation, spend: confirmation.spend ?? spend };
      const out = await kernel.executeNode(node, args, ctx, once);
      traceStore.record({
        driver,
        command: node.id,
        title: node.title,
        args,
        ...fromOutcome(out, confirmation?.grant),
      });
      return out;
    },
  };
}

/** A presented grant's signature, shortened for the rail; nothing when none was presented. */
const sigOf = (g?: Grant): { sig: string } | Record<string, never> =>
  g ? { sig: `${g.sig.slice(0, 10)}…` } : {};

/** A presented grant that still got a gate back was refused; one that ran was verified. */
function grantState(presented: Grant | undefined, ran: boolean, auto = false): GrantState {
  if (auto) return "policy";
  if (!presented) return "none";
  return ran ? "verified" : "refused";
}

function fromResponse(driver: Driver, req: CommandRequest, res: CommandResponse) {
  const tip = req.path?.[req.path.length - 1];
  const grant = tip?.evidence;
  const base = {
    driver,
    command: tip?.id ?? "(root)",
    title: tip?.id ?? "",
    args: tip?.args ?? {},
    ...(req.input !== undefined && { input: req.input }),
    checks: [],
    problems: [],
    ...sigOf(grant),
  };
  if (res.kind === "completions")
    return { ...base, outcome: "unresolved" as const, grant: grantState(grant, false) };
  const title = res.node.title;
  if (res.kind === "args")
    return {
      ...base,
      title,
      outcome: "args" as const,
      problems: [...res.missing, ...res.errors.map((e) => e.message)],
      grant: grantState(grant, false),
    };
  if (res.kind === "disambiguate")
    return { ...base, title, outcome: "pick" as const, grant: grantState(grant, false) };
  if (res.kind === "gate")
    return {
      ...base,
      title,
      args: res.args,
      outcome: res.verdict.allowed ? ("owed" as const) : ("blocked" as const),
      checks: res.verdict.checks,
      grant: grantState(grant, false),
    };
  return {
    ...base,
    title,
    outcome: "ran" as const,
    grant: grantState(grant, true),
    message: res.result.message,
    ...(res.result.value !== undefined && { value: res.result.value }),
  };
}

function fromOutcome(out: ExecuteOutcome, grant?: Grant) {
  const common = { checks: out.verdict.checks, ...sigOf(grant) };
  if (out.missing.length > 0 || out.argErrors.length > 0)
    return {
      ...common,
      outcome: "args" as const,
      problems: [...out.missing, ...out.argErrors.map((e) => e.message)],
      grant: grantState(grant, false),
    };
  if (!out.verdict.allowed)
    return {
      ...common,
      outcome: "blocked" as const,
      problems: [],
      grant: grantState(grant, false),
    };
  if (out.awaitingConfirm)
    return { ...common, outcome: "owed" as const, problems: [], grant: grantState(grant, false) };
  return {
    ...common,
    outcome: "ran" as const,
    problems: [],
    grant: grantState(grant, true, out.autoAllowed),
    ...(out.result && { message: out.result.message }),
    ...(out.result?.value !== undefined && { value: out.result.value }),
  };
}
