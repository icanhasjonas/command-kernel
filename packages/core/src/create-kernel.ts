import { type CommandRecord, toRecord } from "./audit";
import { type CommandDeps, type CommandRequest, type CommandResponse, command } from "./command";
import { createEntityRegistry, type EntityRegistry, type EntityType } from "./entity";
import { createMemoryEvidenceStore, type EvidenceStore } from "./evidence";
import { evaluateGate, type GatePolicy } from "./gate";
import {
  type Confirmation,
  collectChords,
  collectShortcuts,
  type ExecuteOutcome,
  executeNode,
  resolveChildren,
  searchNodes,
} from "./kernel";
import { createMemoryPolicyStore, type PolicyStore } from "./policy";
import { type Ranker, rank } from "./rank";
import type { Registry } from "./registry";
import type { ArgValues, CommandNode, Ctx, FallbackSearch, Ranked } from "./types";

/**
 * createKernel — where the SEAMS meet.
 *
 * One instance bundles the configured behaviour: a ranker, a gate policy, an
 * evidence store, a policy store, and (optionally) a provider registry. Every
 * driver shares this one instance, so the human palette and the AI agent go
 * through the IDENTICAL gate + evidence — the security invariant, made physical
 * by there being one object.
 *
 * Zero-config stays trivial — every seam has a default:
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
  /** grant sign/verify store (default: in-memory session-salted) */
  evidence?: EvidenceStore;
  /** always-allow store (default: in-memory session-scoped) */
  policy?: PolicyStore;
  /** typed-entity catalog backing entity args (a registry or a list of types) */
  entities?: EntityRegistry | EntityType[];
  /** opt-in fallback when the primary search yields no results */
  fallback?: FallbackSearch;
  /** observability hook — fires after every successful run (audit / telemetry / undo) */
  onExecute?: (record: CommandRecord, response: CommandResponse) => void;
}

export interface Kernel {
  /** the one verb — roots default to the configured registry/static roots */
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
  /** the assembled root list (from the registry, or the static roots) */
  roots(ctx?: Ctx): CommandNode[];
  /** chord-leader lookup over the roots */
  chords(ctx?: Ctx): Map<string, CommandNode>;
  /** all nodes that carry a `shortcut`, filtered by `when` + gate visibility */
  shortcuts(ctx: Ctx): Map<string, CommandNode>;
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
  const deps: CommandDeps = {
    ranker,
    gate,
    evidence,
    policy,
    ...(entities != null && { entities }),
  };

  const roots = (ctx?: Ctx): CommandNode[] => (registry ? registry.roots(ctx) : staticRoots);
  const onExecute = config.onExecute;

  return {
    command: async (req, ctx, r) => {
      const res = await command(r ?? roots(ctx), req, ctx, deps);
      if (res.kind === "result" && onExecute) onExecute(toRecord(req, ctx), res);
      return res;
    },
    search: (nodes, query, ctx) => searchNodes(nodes, query, ctx, ranker),
    resolveChildren,
    executeNode: (node, args, ctx, confirmation) =>
      executeNode(node, args, ctx, deps, confirmation),
    roots,
    chords: (ctx) => collectChords(roots(ctx)),
    shortcuts: (ctx) => collectShortcuts(roots(ctx), ctx),
    fallback,
    ranker,
    gate,
    evidence,
    policy,
    registry,
    entities,
  };
}
