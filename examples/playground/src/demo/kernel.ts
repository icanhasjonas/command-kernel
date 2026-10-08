import { createKernel } from "@command-kernel/core";
import { personEntity, submissionEntity } from "../providers/entities";
import { FILE_SHAPES } from "../providers/files";
import { ROOTS } from "../providers/registry";
import { tap } from "../trace/tap";

/**
 * THE kernel: one instance for the whole page. Every driver gets a tap on it (the
 * same gate, the same evidence key, the same always-allow policy), so a grant the
 * palette mints is the grant the agent's call is checked against. That sharing is
 * the security invariant, made physical by there being one object.
 */
export const kernel = createKernel({
  roots: ROOTS,
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
