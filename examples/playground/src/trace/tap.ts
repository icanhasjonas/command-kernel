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
 * A driver's tap on the ONE kernel: the same instance, the same gate, evidence and
 * policy, with every executing call written to the trace rail. Nothing here decides
 * anything; it only watches what the kernel answered. `pipe` is rebuilt on the
 * tapped `command`, so each step of a pipe lands in the rail as its own call.
 */
export function tap(kernel: Kernel, driver: Driver): Kernel {
  const command: Kernel["command"] = async (req, ctx, roots) => {
    const res = await kernel.command(req, ctx, roots);
    if (req.execute) traceStore.record(fromResponse(driver, req, res));
    return res;
  };
  return {
    ...kernel,
    command,
    pipe: (req, ctx) => runPipe((r) => command(r, ctx), req, kernel.isA),
    executeNode: async (node, args, ctx, confirmation) => {
      const out = await kernel.executeNode(node, args, ctx, confirmation);
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
