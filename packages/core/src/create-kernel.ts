import type { ArgValues } from "./args.js";
import { type CommandRecord, toRecord } from "./audit.js";
import { type CommandDeps, type CommandRequest, type CommandResponse, command } from "./command.js";
import { createEntityRegistry, type EntityRegistry, type EntityType } from "./entity.js";
import { bindingKey, createMemoryEvidenceStore, type EvidenceStore } from "./evidence.js";
import { evaluateGate, type GatePolicy } from "./gate.js";
import {
  type Confirmation,
  type ExecuteOutcome,
  executeNode,
  resolveChildren,
  searchNodes,
} from "./kernel.js";
import { type ShortcutConflict, validateShortcuts } from "./keyboard.js";
import { collectChords, collectShortcuts, shortcutNodes } from "./node-lookups.js";
import { observe } from "./observe.js";
import { createMemoryPolicyStore, type PolicyStore } from "./policy.js";
import { type Ranker, rank } from "./rank.js";
import type { Registry } from "./registry.js";
import { signingArgs } from "./signing.js";
import type { CommandNode, Ctx, FallbackSearch, Grant, Ranked } from "./types.js";

/**
 * createKernel - where the SEAMS meet.
 *
 * One instance bundles the configured behaviour: a ranker, a gate policy, an
 * evidence store, a policy store, and (optionally) a provider registry. Every
 * driver shares this one instance, so the human palette and the AI agent go
 * through the IDENTICAL gate + evidence - the security invariant, made physical
 * by there being one object.
 *
 * Zero-config stays trivial - every seam has a default:
 *
 *   const kernel = createKernel({ roots })          // stock everything
 *
 * Opt into any seam without paying for the others:
 *
 *   createKernel({
 *     registry,                                     // lazy provider contribution
 *     ranker: createRanker({ frecency: 12 }),       // tuned ranking
 *     gate: myOwnershipPolicy,                       // your roles, your rules
 *     evidence: createRedisEvidenceStore(),          // persistent grants
 *     policy: createLocalStoragePolicyStore(),        // persistent always-allow
 *   })
 */
export interface KernelConfig {
  /** static root commands (use this OR `registry`) */
  roots?: CommandNode[];
  /** a provider registry for lazy/contextual roots (overrides `roots`) */
  registry?: Registry;
  /** ranking blend (default: the stock fzf-flavoured `rank`) */
  ranker?: Ranker;
  /** permission gate (default: the viewer<advisor<admin `evaluateGate`) */
  gate?: GatePolicy;
  /** grant sign/verify store (default: HMAC-SHA256 under a random per-store key) */
  evidence?: EvidenceStore;
  /** always-allow store (default: in-memory session-scoped) */
  policy?: PolicyStore;
  /** typed-entity catalog backing entity args (a registry or a list of types) */
  entities?: EntityRegistry | EntityType[];
  /** opt-in fallback when the primary search yields no results */
  fallback?: FallbackSearch;
  /**
   * observability hook - fires after every successful run (audit / telemetry / undo).
   * The command already ran: a hook that throws or rejects is swallowed and the caller
   * still gets the result, so catch and report inside the hook if you need to know.
   */
  onExecute?: (record: CommandRecord, response: CommandResponse) => void;
  /**
   * Who a grant belongs to (default: `ctx.user.id`). A grant minted for one
   * principal never verifies for another, so it cannot be handed on or replayed
   * by a different caller. Return undefined to bind no principal.
   */
  principalOf?: (ctx: Ctx) => string | undefined;
  /**
   * The clock grants are minted and checked against, wall-clock ms (default
   * `Date.now`). Never `ctx.now`: a host that builds its ctx once per socket (or
   * rebuilds it from what a hibernating Durable Object saved) would freeze it, and a
   * grant would never expire. Pass a fake clock in tests.
   */
  now?: () => number;
}

/**
 * What `grantFor` signs: a `gate` response, or the same fields a driver holds itself.
 * `now` is when the human approved, on the kernel's clock (default: the clock, now);
 * the grant expires a TTL after it.
 */
export type GrantRequest = Pick<
  Extract<CommandResponse, { kind: "gate" }>,
  "node" | "args" | "priorKey" | "principal"
> & { now?: number };

export interface Kernel {
  /** the one verb - roots default to the configured registry/static roots */
  command(req: CommandRequest, ctx: Ctx, roots?: CommandNode[]): Promise<CommandResponse>;
  /** rank a node list with the configured ranker */
  search(nodes: CommandNode[], query: string, ctx: Ctx): Ranked[];
  /** drill a node's children (pure passthrough) */
  resolveChildren(node: CommandNode, args: ArgValues, ctx: Ctx): Promise<CommandNode[]>;
  /** gate + run a node against the configured trust core */
  executeNode(
    node: CommandNode,
    args: ArgValues,
    ctx: Ctx,
    confirmation?: Confirmation,
  ): Promise<ExecuteOutcome>;
  /**
   * Mint the grant for a `gate` response - the ONE correct way for a driver to
   * turn a human's "Allow" into evidence. It signs the kernel's EFFECTIVE args
   * (post-prefill, post-entity-resolution) against the response's `priorKey`, so
   * re-issuing the same request with this grant verifies. Minting by hand from
   * the args you typed does not, whenever the kernel derived anything. The grant
   * is bound to `res.principal`: it verifies only for that same principal.
   */
  grantFor(res: GrantRequest): Grant;
  /** who a grant minted under `ctx` belongs to (see `KernelConfig.principalOf`) */
  principalOf(ctx: Ctx): string | undefined;
  /** the assembled root list (from the registry, or the static roots) */
  roots(ctx?: Ctx): CommandNode[];
  /** chord-leader lookup over the roots */
  chords(ctx?: Ctx): Map<string, CommandNode>;
  /**
   * Nodes carrying a `shortcut`, filtered by `when(ctx)`, keyed by the shortcut
   * string. Duplicates collapse - see `shortcutConflicts`.
   */
  shortcuts(ctx: Ctx): Map<string, CommandNode>;
  /** shortcut strings bound to more than one visible node (empty when clean) */
  shortcutConflicts(ctx: Ctx): ShortcutConflict[];
  /** opt-in fallback when the primary search yields no results (null if none) */
  readonly fallback: FallbackSearch | null;
  readonly ranker: Ranker;
  readonly gate: GatePolicy;
  readonly evidence: EvidenceStore;
  readonly policy: PolicyStore;
  readonly registry: Registry | null;
  /** the typed-entity catalog (query it for an agent, or null if none) */
  readonly entities: EntityRegistry | null;
}

export function createKernel(config: KernelConfig = {}): Kernel {
  const ranker = config.ranker ?? rank;
  const gate = config.gate ?? evaluateGate;
  const evidence = config.evidence ?? createMemoryEvidenceStore();
  const policy = config.policy ?? createMemoryPolicyStore();
  const registry = config.registry ?? null;
  const entities = config.entities
    ? Array.isArray(config.entities)
      ? createEntityRegistry(...config.entities)
      : config.entities
    : null;
  const fallback = config.fallback ?? null;
  const staticRoots = config.roots ?? [];
  const principalOf = config.principalOf ?? ((ctx: Ctx) => ctx.user.id);
  const clock = config.now ?? (() => Date.now());
  const deps: CommandDeps = {
    ranker,
    gate,
    evidence,
    policy,
    principalOf,
    now: clock,
    ...(entities != null && { entities }),
  };

  const roots = (ctx?: Ctx): CommandNode[] => (registry ? registry.roots(ctx) : staticRoots);
  const onExecute = config.onExecute;

  return {
    command: async (req, ctx, r) => {
      const res = await command(r ?? roots(ctx), req, ctx, deps);
      if (res.kind === "result" && onExecute) observe(() => onExecute(toRecord(req, ctx), res));
      return res;
    },
    search: (nodes, query, ctx) => searchNodes(nodes, query, ctx, ranker),
    resolveChildren,
    executeNode: (node, args, ctx, confirmation) =>
      executeNode(node, args, ctx, deps, confirmation),
    grantFor: (res) =>
      evidence.sign(
        res.node.id,
        signingArgs(res.node, res.args),
        bindingKey(res.principal, res.priorKey),
        { now: res.now ?? clock() },
      ),
    principalOf,
    roots,
    chords: (ctx) => collectChords(roots(ctx)),
    shortcuts: (ctx) => collectShortcuts(roots(ctx), ctx),
    shortcutConflicts: (ctx) => validateShortcuts(shortcutNodes(roots(ctx), ctx)),
    fallback,
    ranker,
    gate,
    evidence,
    policy,
    registry,
    entities,
  };
}
