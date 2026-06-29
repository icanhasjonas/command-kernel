/**
 * @command-kernel/core — the headless command kernel.
 *
 * The public surface of the hero. Every driver (palette, agent, chords,
 * deeplinks) imports from HERE and nowhere deeper. Zero framework imports live
 * behind this entry point; see the covenant in the repo CLAUDE.md.
 *
 *   const kernel = createKernel({ roots })            // wire the seams (or defaults)
 *   await kernel.command({ path, query }, ctx)        // the one verb
 *
 * Around the verb sit FIVE documented extension SEAMS, each with a default:
 *   1. Ranker        — rank.ts        (createRanker / your own)
 *   2. GatePolicy    — gate.ts        (evaluateGate / your own)
 *   3. EvidenceStore — evidence.ts    (createMemoryEvidenceStore / your own)
 *   4. PolicyStore   — policy.ts      (createMemoryPolicyStore / your own)
 *   5. Registry      — registry.ts    (createRegistry)
 */

// audit + replay — a serializable command record and a replay verb
export { type CommandRecord, replay, toRecord } from "./audit";
// the one verb + its request/response shapes (usually reached via kernel.command)
export {
  type CommandDeps,
  type CommandRequest,
  type CommandResponse,
  type Completion,
  command,
} from "./command";
// the kernel factory — where the seams meet
export { createKernel, type Kernel, type KernelConfig } from "./create-kernel";
// DRIVER #4 — deeplinks (serialize / parse a path; same arg schema)
export { type DeeplinkOptions, parseDeeplink, serializePath } from "./deeplink";
// self-description — what an agent reads to navigate the tree without guessing
export {
  type ArgDescriptor,
  describeNode,
  describeTree,
  effectMode,
  enumerateMode,
  type NodeDescriptor,
} from "./describe";
// SEAM 6 — the typed-entity catalog (App Intents AppEntity + EntityQuery)
export {
  createEntityRegistry,
  type Entity,
  type EntityRegistry,
  type EntitySearchOptions,
  type EntityType,
  entityOption,
} from "./entity";
// SEAM 3 — evidence (the session-salted honesty tag)
export { createMemoryEvidenceStore, type EvidenceStore, pathKey } from "./evidence";
export { type FuzzyResult, fuzzyMatch } from "./fuzzy";
// SEAM 2 — the gate (the single permission-enforcement point)
export { createRoleGate, evaluateGate, type GatePolicy, isGated } from "./gate";
// the lower verbs the drivers compose (usually reached via the Kernel instance)
export {
  bumpFrecency,
  type Confirmation,
  collectChords,
  collectShortcuts,
  type ExecuteDeps,
  type ExecuteOutcome,
  executeNode,
  missingArgs,
  resolveChildren,
  searchNodes,
} from "./kernel";
// keyboard driver — layer stack, chord state machine, shortcut registration
export {
  type KeyBindings,
  type KeyHandler,
  type KeyLayerOptions,
  normalizeEvent,
  popLayer,
  pushLayer,
  registerShortcuts,
  type ShortcutConflict,
  type ShortcutDriverOptions,
  setChordTimeout,
  subscribeChordMode,
  validateShortcuts,
} from "./keyboard";
// SEAM 4 — policy (session-scoped always-allow); ruleForNode/allowLabel are pure helpers
export {
  type AllowRule,
  type AllowScope,
  allowLabel,
  createMemoryPolicyStore,
  type PolicyStore,
  ruleForNode,
} from "./policy";
// SEAM 1 — ranking
export { createRanker, type Ranker, type RankWeights, rank } from "./rank";
// SEAM 5 — the provider registry
export { createRegistry, type Provider, type Registry } from "./registry";
// the keystone — the arg schema, derived into JSON Schema + runtime validation
export {
  type ArgError,
  type JsonSchema,
  type JsonSchemaNode,
  type JsonSchemaObject,
  type JsonSchemaProperty,
  toJsonSchema,
  validateArgs,
} from "./schema";
// shortcut string parsing, matching, and formatting
export { formatShortcut, matchesEvent, type ParsedShortcut, parseShortcut } from "./shortcut";
// the data model
export type {
  ArgKind,
  ArgOption,
  ArgSpec,
  ArgValue,
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  EffectMode,
  EntityRef,
  EnumerateMode,
  FallbackSearch,
  Gate,
  GateCheck,
  GateVerdict,
  Grant,
  PathSegment,
  Ranked,
  ResultKind,
  Role,
} from "./types";
// arg-value helpers (single | list — for `multiple` args)
export { argList, argText, isFilled } from "./values";
