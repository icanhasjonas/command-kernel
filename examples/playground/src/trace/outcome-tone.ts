import type { Outcome } from "./trace-store";

/** The colour an outcome is said in, wherever a single call is summed up. */
export const OUTCOME_TONE: Record<Outcome, string> = {
  ran: "text-teal-soft",
  owed: "text-amber-soft",
  pick: "text-amber-soft",
  args: "text-amber-soft",
  blocked: "text-red-300",
  unresolved: "text-red-300",
  unreached: "text-red-300",
  mistyped: "text-red-300",
  denied: "text-white/55",
};
