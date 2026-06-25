/**
 * The universal command system — headless core.
 *
 * ZERO framework imports live in this folder. A CommandNode is plain data +
 * two async hooks (`resolve` to drill in, `run` to execute). Every surface
 * (palette, agent, chords, deeplinks) is just a renderer over this kernel.
 */

/**
 * A principal's role. Deliberately `string`, not a fixed union — a consumer
 * brings their own roles. The default gate (`createRoleGate`) understands an
 * ordered ladder; the demo uses "viewer" < "advisor" < "admin", but yours can be
 * anything. Swap the whole `GatePolicy` for non-ladder rules (ownership, flags).
 */
export type Role = string;

export type ArgKind = "string" | "email" | "enum" | "entity" | "text";

export interface ArgOption {
  value: string;
  label: string;
  hint?: string;
  /** lucide icon name */
  icon?: string;
}

/**
 * A reference from an arg to a registered entity TYPE (see entity.ts), with an
 * optional opaque constraint — the runtime form of `Person<'with-email-address'>`.
 * The arg's value is the chosen entity's id; the registered `EntityType` is the
 * completion source and the agent-queryable catalog.
 */
export interface EntityRef {
  /** the registered entity type name, e.g. "person" */
  type: string;
  /** opaque refinement the entity provider interprets, e.g. "with-email-address" */
  constraint?: string;
}

export interface ArgSpec {
  id: string;
  label: string;
  kind: ArgKind;
  required?: boolean;
  /** the single Quicksilver "direct object" arg, typed inline after the title */
  positional?: boolean;
  placeholder?: string;
  enumValues?: ArgOption[];
  /**
   * Reference to a registered entity type. When set, the entity registry is the
   * completion source (no hand-rolled `complete` needed) and an agent can query
   * the same catalog. Resolution order for options: enumValues -> entity -> complete.
   */
  entity?: EntityRef;
  /** async, arg-scoped value completion (one-off; entity is the registered path) */
  complete?: (query: string, ctx: Ctx) => Promise<ArgOption[]>;
  /** return an error string, or null when valid */
  validate?: (value: string) => string | null;
}

export type ArgValues = Record<string, string>;

/** A permission requirement declared ONCE on the node; the kernel enforces it. */
export interface Gate {
  roles?: Role[];
  confirm?: boolean;
  reason?: string;
}

/**
 * The honesty tag a gate mints when a human (or an agent's operator) approves
 * an action. It is NOT a security token — it's a cheap, session-salted hash
 * bound to the EXACT (command, args, prior-path) that was shown and allowed.
 * Its only job: a caller — the agent especially — cannot FABRICATE approval,
 * because it can't compute a valid tag without going through the gate. Reload
 * the page → new session salt → every prior grant fails to verify. See
 * `evidence.ts`.
 */
export interface Grant {
  nonce: string;
  sig: string;
}

/**
 * One hop of an addressed command chain. A segment is either a bare id or this
 * object carrying the args bound at that hop AND the per-segment `evidence`
 * (the grant) proving that hop was approved. Evidence lives ON the segment, not
 * once at the top — the chain carries its own permissions as it grows.
 */
export interface PathSegment {
  id: string;
  args?: ArgValues;
  evidence?: Grant;
}

export interface GateCheck {
  label: string;
  ok: boolean;
}

export interface GateVerdict {
  allowed: boolean;
  needsConfirm: boolean;
  checks: GateCheck[];
}

export type ResultKind = "toast" | "page" | "navigate" | "noop";

export interface CommandResult {
  kind: ResultKind;
  message: string;
  payload?: unknown;
}

/**
 * Enumeration cost of a node's `resolve()` — does listing its children cost
 * anything? "free" = static, in-memory children, safe to eagerly scout for
 * context. "query" = async, hits a backend, may be large, needs a search term
 * first — an agent must NOT blindly enumerate it. Inferred when omitted: a node
 * with a positional (search) arg defaults to "query", otherwise "free".
 */
export type EnumerateMode = "free" | "query";

/**
 * Execution effect of a node's `run()`. "pure" = no side effects, safe to run
 * for discovery. "writes" = changes state (and is gated). Inferred when omitted:
 * a gated node defaults to "writes", otherwise "pure".
 */
export type EffectMode = "pure" | "writes";

export interface CommandNode {
  id: string;
  title: string;
  subtitle?: string;
  /**
   * Agent-facing description: what this node IS and what lives under it — the
   * natural language an agent reads to navigate the tree WITHOUT guessing.
   * (`subtitle` is the terse one-line UI caption; `summary` is the fuller,
   * machine-readable capability blurb. Falls back to `subtitle` when omitted.)
   */
  summary?: string;
  /** Enumeration cost of resolve(); inferred from a positional arg when omitted. */
  enumerate?: EnumerateMode;
  /** Execution effect of run(); inferred from the gate when omitted. */
  effect?: EffectMode;
  /** parent category id; root nodes omit it */
  category?: string;
  /** lucide icon name */
  icon?: string;
  keywords?: string[];
  /** static authoring priority, 0..100 */
  weight?: number;
  /** single key pressed after the chord leader to jump straight here */
  chord?: string;
  args?: ArgSpec[];
  gate?: Gate;
  /** visibility predicate against the current context */
  when?: (ctx: Ctx) => boolean;
  /** dynamic rank bump for the current location */
  boost?: (ctx: Ctx) => number;
  /** context-provided arg defaults (e.g. the submission you're looking at) */
  prefill?: (ctx: Ctx) => ArgValues;
  /** drill IN: lazily list child nodes (async OK). Presence => navigable. */
  resolve?: (args: ArgValues, ctx: Ctx) => Promise<CommandNode[]>;
  /** EXECUTE: perform the action. Presence => runnable. */
  run?: (args: ArgValues, ctx: Ctx) => Promise<CommandResult>;
}

export interface Ctx {
  location: { module: string; recordId?: string; label?: string };
  user: { id: string; name: string; role: Role; brand: string };
  now: number;
  /** commandId -> learned recency*frequency score */
  frecency: Record<string, number>;
}

/** A node after fuzzy match, carrying score + the matched character offsets. */
export interface Ranked {
  node: CommandNode;
  score: number;
  /** indices into node.title that matched the query, for highlighting */
  positions: number[];
}
