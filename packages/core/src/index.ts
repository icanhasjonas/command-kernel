/**
 * @command-kernel/core - the headless command kernel.
 *
 * The public surface of the hero. Every driver (palette, agent, chords,
 * deeplinks) imports from HERE and nowhere deeper. Zero framework imports live
 * behind this entry point; see the covenant in the repo CLAUDE.md.
 *
 *   const kernel = createKernel({ roots })            // wire the seams (or defaults)
 *   await kernel.command({ path, query }, ctx)        // the one verb
 *
 * Around the verb sit FIVE documented extension SEAMS, each with a default:
 *   1. Ranker        - rank.ts        (createRanker / your own)
 *   2. GatePolicy    - gate.ts        (evaluateGate / your own)
 *   3. EvidenceStore - evidence.ts    (createMemoryEvidenceStore / your own)
 *   4. PolicyStore   - policy.ts      (createMemoryPolicyStore / your own)
 *   5. Registry      - registry.ts    (createRegistry)
 */

// the arg vocabulary
export type {
  ArgKind,
  ArgOption,
  ArgSpec,
  ArgValue,
  ArgValues,
  EntityRef,
  JsonValue,
  Piped,
  ValueType,
} from "./args.js";
// audit + replay - a serializable command record and a replay verb
export { type CommandRecord, replay, toRecord } from "./audit.js";
// availability: why a node cannot run now, and the keyboard scopes it lives in
export { disabledReason, GLOBAL_SCOPE, nodeScopes } from "./availability.js";
// typed args: text from a palette or URL parsed to the declared number/boolean/json
export { coerceArgs } from "./coerce.js";
// the one verb + its request/response shapes (usually reached via kernel.command)
export {
  type CommandDeps,
  type CommandRequest,
  type CommandResponse,
  type Completion,
  command,
} from "./command.js";
// the kernel factory - where the seams meet
export {
  createKernel,
  type GrantRequest,
  type Kernel,
  type KernelConfig,
} from "./create-kernel.js";
// DRIVER #4 - deeplinks (serialize / parse a path; same arg schema)
export { type DeeplinkOptions, parseDeeplink, serializePath } from "./deeplink.js";
// self-description - what an agent reads to navigate the tree without guessing
export {
  type ArgDescriptor,
  declaredEffect,
  describeNode,
  describeTree,
  effectMode,
  enumerateMode,
  type NodeDescriptor,
} from "./describe.js";
// SEAM 6 - the typed-entity catalog (App Intents AppEntity + EntityQuery)
export {
  createEntityRegistry,
  type Entity,
  type EntityRegistry,
  type EntitySearchOptions,
  type EntityType,
  entityOption,
} from "./entity.js";
// a run() that fails for a reason a caller can act on throws one of these
export { CommandError, isCommandError } from "./errors.js";
// SEAM 3: evidence (the HMAC-SHA256 grant signature)
export {
  bindingKey,
  createHmacEvidenceStore,
  createMemoryEvidenceStore,
  type EvidenceStore,
  type HmacStoreOptions,
  pathKey,
  type SignOptions,
} from "./evidence.js";
export { type FuzzyResult, fuzzyMatch } from "./fuzzy.js";
// SEAM 2 - the gate (the single permission-enforcement point)
export { createRoleGate, evaluateGate, type GatePolicy, isGated } from "./gate.js";
// the key of a walked chain (command() and any driver that walks one itself)
export { type Hop, hopArgs, hopsKey } from "./hops-key.js";
// the lower verbs the drivers compose (usually reached via the Kernel instance)
export {
  type Confirmation,
  type ExecuteDeps,
  type ExecuteMode,
  type ExecuteOutcome,
  executeNode,
  missingArgs,
  resolveChildren,
  searchNodes,
} from "./kernel.js";
// keyboard driver - instance-scoped layer stack + chord state machine.
// The HOST feeds keys in (bubble phase; `@command-kernel/react` has `attachKeyboard`); core
// stays DOM-free.
export {
  type ChordCompletion,
  type ChordListener,
  canonicalBinding,
  createKeyboard,
  type DeclinedListener,
  isEditableTarget,
  type KernelKeyEvent,
  type KeyBindings,
  type Keyboard,
  type KeyboardOptions,
  type KeyHandler,
  type KeyLayer,
  type KeyLayerOptions,
  type LayerInfo,
  type LayerUpdate,
  type MountOptions,
  normalizeEvent,
  normalizeShortcut,
  type ReachableKey,
  type ScopeBinding,
  type ScopeBindingOptions,
  type ShortcutConflict,
  type ShortcutDriverOptions,
  type StackDescription,
  validateShortcuts,
} from "./keyboard.js";
// chord / shortcut / frecency lookups a driver builds over a node list
export { bumpFrecency, collectChords, collectShortcuts, shortcutNodes } from "./node-lookups.js";
// pipes - one command's output is the next one's input (routing + a type check)
export {
  acceptingArg,
  accepts,
  bindInput,
  describeType,
  fitsExactly,
  outputOf,
} from "./pipe.js";
export {
  type ActionsForOptions,
  actionsFor,
  type PipeAction,
  type RankedAction,
  rankActions,
} from "./pipe-routes.js";
export { type PipeRequest, type PipeResponse, type PipeStep, runPipe } from "./pipe-run.js";
// SEAM 4 - policy (session-scoped always-allow); ruleForNode/allowLabel are pure helpers
export {
  type AllowRule,
  type AllowScope,
  allowLabel,
  createMemoryPolicyStore,
  type PolicyStore,
  ruleForNode,
} from "./policy.js";
// SEAM 1 - ranking
export { createRanker, type Ranker, type RankWeights, rank } from "./rank.js";
// SEAM 5 - the provider registry
export { createRegistry, type Provider, type Registry } from "./registry.js";
// the keystone - the arg schema, derived into JSON Schema + runtime validation
export {
  type ArgError,
  type JsonSchemaNode,
  type JsonSchemaObject,
  toJsonSchema,
  validateArgs,
} from "./schema.js";
// shortcut string parsing, matching, and formatting
export {
  canonicalKey,
  currentPlatform,
  type KeyEventLike,
  matchesEvent,
  type ParsedShortcut,
  type Platform,
  parseShortcut,
} from "./shortcut.js";
// how a shortcut is shown: key caps for <kbd>, one line of text, aria-keyshortcuts
export { ariaKeyShortcuts, formatShortcut, shortcutKeys } from "./shortcut-display.js";
// the canonical form a grant is signed and verified over (sign with this, never raw args)
export { canonicalJson, signingArgs } from "./signing.js";
// the data model
export type {
  CommandNode,
  CommandResult,
  Ctx,
  EffectMode,
  EnumerateMode,
  Fact,
  FallbackSearch,
  Gate,
  GateCheck,
  GateVerdict,
  Grant,
  PathSegment,
  Ranked,
  ResultKind,
  Role,
} from "./types.js";
// arg-value helpers (single | list - for `multiple` args)
export { argList, argText, isFilled } from "./values.js";
