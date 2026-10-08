import { type Ctx, createKernel, evaluateGate, type GatePolicy } from "@command-kernel/core";
import { personEntity, submissionEntity } from "../providers/entities";
import { FILE_SHAPES } from "../providers/files";
import { ROOTS } from "../providers/registry";
import { tap } from "../trace/tap";

/** A call that arrived in a URL: the person did not choose it, they clicked a link. */
export const viaLink = (ctx: Ctx): Ctx => ({ ...ctx, facts: { ...ctx.facts, via: "link" } });

/**
 * The stock role ladder, plus one rule of this app's: a command that writes, reached
 * through a link, owes a confirm. Any page can link here, so a link alone must not
 * send an email. It lives in the gate, so every driver that says `via: "link"` gets
 * it, and none can skip it.
 */
const gate: GatePolicy = (node, ctx) => {
  const verdict = evaluateGate(node, ctx);
  if (ctx.facts?.via !== "link" || node.effect !== "writes" || verdict.needsConfirm) return verdict;
  return {
    ...verdict,
    needsConfirm: true,
    checks: [
      ...verdict.checks,
      { label: "opened from a link: you confirm what it writes", ok: true },
    ],
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
  deeplink: tap(kernel, "deeplink", { handsOverGates: true }),
  invoker: tap(kernel, "invoker", { handsOverGates: true }),
  agent: tap(kernel, "agent"),
  pipe: tap(kernel, "pipe"),
  gateLab: tap(kernel, "gate-lab"),
};
