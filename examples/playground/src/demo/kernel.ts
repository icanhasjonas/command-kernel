import { type Ctx, createKernel, evaluateGate, type GatePolicy } from "@command-kernel/core";
import { personEntity, submissionEntity } from "../providers/entities";
import { FILE_SHAPES } from "../providers/files";
import { ROOTS } from "../providers/registry";
import { tap } from "../trace/tap";

/** Who chose this call, when it was not the person: a link they clicked, or the agent. */
type Via = "link" | "agent";

/** Why a write that came this way waits for the person, said on the confirm. */
const WHY: Record<Via, string> = {
  link: "opened from a link: you confirm what it writes",
  agent: "asked for by the agent: you confirm what it writes",
};

const via =
  (how: Via) =>
  (ctx: Ctx): Ctx => ({ ...ctx, facts: { ...ctx.facts, via: how } });

/** A call that arrived in a URL: the person did not choose it, they clicked a link. */
export const viaLink = via("link");
/** A call the agent made: a model chose it, not the person. */
export const viaAgent = via("agent");

/**
 * The stock role ladder, plus one rule of this app's: a command that writes, reached
 * through a link or chosen by the agent, owes a confirm. Any page can link here, and
 * a model can be talked into anything, so neither alone sends an email. It lives in
 * the gate, so every driver that says how it came gets it, and none can skip it.
 */
const gate: GatePolicy = (node, ctx) => {
  const verdict = evaluateGate(node, ctx);
  const how = ctx.facts?.via;
  if ((how !== "link" && how !== "agent") || node.effect !== "writes" || verdict.needsConfirm)
    return verdict;
  return {
    ...verdict,
    needsConfirm: true,
    checks: [...verdict.checks, { label: WHY[how], ok: true }],
  };
};

/**
 * THE kernel: one instance for the whole page. Every driver gets a tap on it (the
 * same gate, the same evidence key, the same always-allow policy), so a grant the
 * palette mints is the grant the agent's call is checked against. That sharing is
 * the security invariant, made physical by there being one object.
 */
export const kernel = createKernel({
  roots: ROOTS,
  gate,
  entities: [personEntity, submissionEntity, ...FILE_SHAPES],
});

export const drivers = {
  palette: tap(kernel, "palette"),
  chord: tap(kernel, "chord"),
  deeplink: tap(kernel, "deeplink", { handsOverGates: true, handsOverArgs: true }),
  invoker: tap(kernel, "invoker", { handsOverGates: true }),
  agent: tap(kernel, "agent"),
  pipe: tap(kernel, "pipe"),
  gateLab: tap(kernel, "gate-lab"),
};
