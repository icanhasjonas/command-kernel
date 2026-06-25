/**
 * @command-kernel/core — the headless command kernel.
 *
 * The public surface of the hero. Every driver (palette, agent, chords,
 * deeplinks) imports from HERE and nowhere deeper. Zero framework imports live
 * behind this entry point; see the covenant in the repo CLAUDE.md.
 *
 *   command(roots, req, ctx) -> completions | args | gate | result   (the one verb)
 *
 * Around the verb sit the trust core (gate / evidence / policy) and the ranking
 * blend (fuzzy / rank). Each of those is a documented EXTENSION SEAM with a
 * sensible default — see the per-symbol docs and the package README.
 */

export type { CommandRequest, CommandResponse, Completion } from "./command";
// the one verb + its request/response shapes
export { command } from "./command";
// self-description — what an agent reads to navigate the tree without guessing
export {
  type ArgDescriptor,
  describeNode,
  describeTree,
  effectMode,
  enumerateMode,
  type NodeDescriptor,
} from "./describe";
// evidence — the session-salted honesty tag (sign / verify a per-act grant)
export {
  grantForPath,
  pathKey,
  rotateSessionSalt,
  sessionSalt,
  signGrant,
  verifyGrant,
} from "./evidence";
export { type FuzzyResult, fuzzyMatch } from "./fuzzy";

// the gate — the single permission-enforcement point
export { evaluateGate, isGated } from "./gate";
// the four-verb facade the drivers compose
export {
  bumpFrecency,
  type Confirmation,
  collectChords,
  type ExecuteOutcome,
  executeNode,
  missingArgs,
  resolveChildren,
  searchNodes,
} from "./kernel";

// policy — session-scoped always-allow rules
export {
  type AllowRule,
  type AllowScope,
  allowAlways,
  allowLabel,
  clearAllowRules,
  listAllowRules,
  matchingAllow,
  revokeAllow,
  ruleForNode,
} from "./policy";
// ranking — fuzzy match + the blend (swap the blend by re-ranking yourself)
export { rank } from "./rank";

// the data model
export type {
  ArgKind,
  ArgOption,
  ArgSpec,
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  EffectMode,
  EnumerateMode,
  Gate,
  GateCheck,
  GateVerdict,
  Grant,
  PathSegment,
  Ranked,
  ResultKind,
  Role,
} from "./types";
