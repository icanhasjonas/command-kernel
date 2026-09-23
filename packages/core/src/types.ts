/**
 * The universal command system -- headless core.
 *
 * ZERO framework imports live in this folder. A CommandNode is plain data +
 * two async hooks (`resolve` to drill in, `run` to execute). Every surface
 * (palette, agent, chords, deeplinks, the wire) is just a renderer over this kernel.
 */

import type { ArgSpec, ArgValues } from "./args.js";

/**
 * A principal's role. Deliberately `string`, not a fixed union - a consumer
 * brings their own roles. The default gate (`createRoleGate`) understands an
 * ordered ladder; the demo uses "viewer" < "advisor" < "admin", but yours can be
 * anything. Swap the whole `GatePolicy` for non-ladder rules (ownership, flags).
 */
export type Role = string;

/** A permission requirement declared ONCE on the node; the kernel enforces it. */
export interface Gate {
  roles?: Role[];
  confirm?: boolean;
  reason?: string;
}

/**
 * The signed approval a gate mints when a human (or an agent's operator) approves
 * an action: an HMAC-SHA256 signature, under the evidence store's secret key, over
 * the EXACT (principal, prior path, command, canonical args, nonce) that was shown
 * and allowed. A caller, the agent especially, cannot fabricate approval or turn
 * one grant into another, because it cannot compute a valid signature without the
 * key. A new key (a reload, `rotate()`) makes every prior grant fail to verify. It
 * is not a bearer token: it verifies only for the principal it names, and only
 * until `expiresAt`. See `evidence.ts`.
 */
export interface Grant {
  nonce: string;
  sig: string;
  /**
   * Wall-clock ms after which it no longer verifies; covered by `sig`. Every grant
   * the built-in stores mint has one; a custom store may omit it.
   */
  expiresAt?: number;
}

/**
 * One hop of an addressed command chain. A segment is either a bare id or this
 * object carrying the args bound at that hop AND the per-segment `evidence`
 * (the grant) proving that hop was approved. Evidence lives ON the segment, not
 * once at the top - the chain carries its own permissions as it grows.
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

/**
 * What a run produced. "toast" / "page" / "navigate" / "noop" are for a UI driver
 * to present; "data" is a structured answer for a caller that consumes it (an RPC
 * client, an agent): `payload` IS the answer and `message` is a one-line summary.
 */
export type ResultKind = "toast" | "page" | "navigate" | "noop" | "data";

export interface CommandResult {
  kind: ResultKind;
  message: string;
  payload?: unknown;
}

/**
 * Enumeration cost of a node's `resolve()` - does listing its children cost
 * anything? "free" = static, in-memory children, safe to eagerly scout for
 * context. "query" = async, hits a backend, may be large, needs a search term
 * first - an agent must NOT blindly enumerate it. Inferred when omitted: a node
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
   * Agent-facing description: what this node IS and what lives under it - the
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
  /** global keyboard shortcut, e.g. "shift+mod+d". Platform-agnostic: `mod`
   *  maps to Cmd on Mac, Ctrl elsewhere. Parsed by `parseShortcut()`. */
  shortcut?: string;
  /**
   * The keyboard context(s) its `shortcut` lives in - "list", "thread", "composer" - so one key
   * can mean the right thing in each. The host names its scopes and says which are live for a
   * ctx (`keyboard.bindScopes`); omitted, the node is in `"global"`. A list puts the node in each.
   */
  scope?: string | readonly string[];
  /**
   * Why this node cannot run right now, in words ("Open a thread first"), or undefined when it
   * can. Unlike `when` (which hides the node), a disabled node stays listed, so a palette can say
   * the reason instead of the command silently vanishing. Its shortcut does not fire (the key
   * falls through to whatever is below), and `executeNode` refuses it.
   */
  disabled?: (ctx: Ctx) => string | undefined;
  /** hide from palette search results (the node is still reachable via
   *  shortcut, agent, deeplink, or programmatic access). */
  hide?: boolean | ((ctx: Ctx) => boolean);
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
  /**
   * The host's wall-clock ms, for its own commands. Grant expiry never reads it: that
   * runs on the kernel's clock (`KernelConfig.now`), so a ctx built once and kept is fine.
   */
  now: number;
  /** commandId -> learned recency*frequency score */
  frecency: Record<string, number>;
  /**
   * What is true about where the user is right now, as plain values the host fills in:
   * `{ threadOpen: true, draftFilled: false, dialog: "help" }`. `when`, `disabled` and the
   * keyboard's active scopes read it, so they stay pure functions of the ctx instead of reaching
   * into the host's state.
   */
  facts?: Readonly<Record<string, Fact>>;
}

/** One value in `Ctx.facts`. */
export type Fact = string | number | boolean | null;

/** A node after fuzzy match, carrying score + the matched character offsets. */
export interface Ranked {
  node: CommandNode;
  score: number;
  /** indices into node.title that matched the query, for highlighting */
  positions: number[];
}

/**
 * Opt-in fallback when the primary search yields no results. The driver
 * (palette, agent) decides HOW to present it -- the kernel carries the
 * capability. Typical use: file search across a workspace tree when no
 * commands match. Returned nodes go through the kernel's ranker.
 */
export interface FallbackSearch {
  label: string;
  icon?: string;
  search: (query: string, ctx: Ctx) => Promise<CommandNode[]>;
}
