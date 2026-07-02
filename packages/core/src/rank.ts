import { fuzzyMatch } from "./fuzzy.js";
import type { CommandNode, Ctx, Ranked } from "./types.js";

/**
 * Ranking — SEAM #1.
 *
 * A `Ranker` turns a node list + query + context into scored, ordered results.
 * The default blend is:
 *
 *   final = fuzzyScore                       // how well the text matches
 *         + weight * W_WEIGHT                // static authoring priority
 *         + boost(ctx)                       // where-you-are relevance
 *         + frecency * W_FRECENCY            // learned recency*frequency
 *
 * Tune the two weights with `createRanker({ weight, frecency })`, or replace the
 * whole function with your own `Ranker` (BM25, a learned model, alphabetical —
 * whatever). `createKernel({ ranker })` wires it in; the default is `rank`.
 */
export type Ranker = (nodes: CommandNode[], query: string, ctx: Ctx) => Ranked[];

export interface RankWeights {
  /** multiplier on a node's static `weight` (default 1.1) */
  weight?: number;
  /** multiplier on a node's learned frecency score (default 6) */
  frecency?: number;
}

function haystack(node: CommandNode): string {
  return [node.title, node.category, ...(node.keywords ?? [])].filter(Boolean).join(" ");
}

/** Build a ranker with tuned weights. The default ranker is `createRanker()`. */
export function createRanker(weights: RankWeights = {}): Ranker {
  const W_WEIGHT = weights.weight ?? 1.1;
  const W_FRECENCY = weights.frecency ?? 6;

  return (nodes, query, ctx) => {
    const out: Ranked[] = [];

    for (const node of nodes) {
      if (node.when && !node.when(ctx)) continue;
      const hidden = typeof node.hide === "function" ? node.hide(ctx) : node.hide;
      if (hidden) continue;

      // match the title first (so highlight offsets map to the title), then fall
      // back to the broader haystack (keywords/category) for discovery only.
      const onTitle = fuzzyMatch(query, node.title);
      const onHay = onTitle ?? fuzzyMatch(query, haystack(node));
      if (onHay === null) continue;

      const fuzzyScore = onHay.score;
      const positions = onTitle ? onTitle.positions : [];

      const weight = (node.weight ?? 0) * W_WEIGHT;
      const boost = node.boost ? node.boost(ctx) : 0;
      const frec = (ctx.frecency[node.id] ?? 0) * W_FRECENCY;

      out.push({ node, score: fuzzyScore + weight + boost + frec, positions });
    }

    // primary: score desc. tiebreak: shorter title, then alphabetical (fzf-ish).
    out.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.node.title.length !== b.node.title.length) {
        return a.node.title.length - b.node.title.length;
      }
      return a.node.title.localeCompare(b.node.title);
    });

    return out;
  };
}

/** The default ranker: the fzf-flavoured blend with stock weights. */
export const rank: Ranker = createRanker();
