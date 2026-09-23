import { fuzzyMatch } from "./fuzzy.js";
import type { CommandNode, Ctx, Ranked } from "./types.js";

/**
 * Ranking - SEAM #1.
 *
 * A `Ranker` turns a node list + query + context into scored, ordered results.
 * The default blend is:
 *
 *   final = textScore                        // how well the text matches (see textMatch)
 *         + weight * W_WEIGHT                // static authoring priority
 *         + boost(ctx)                       // where-you-are relevance
 *         + frecency * W_FRECENCY            // learned recency*frequency
 *
 * Tune the two weights with `createRanker({ weight, frecency })`, or replace the
 * whole function with your own `Ranker` (BM25, a learned model, alphabetical -
 * whatever). `createKernel({ ranker })` wires it in; the default is `rank`.
 */
export type Ranker = (nodes: CommandNode[], query: string, ctx: Ctx) => Ranked[];

export interface RankWeights {
  /** multiplier on a node's static `weight` (default 1.1) */
  weight?: number;
  /** multiplier on a node's learned frecency score (default 6) */
  frecency?: number;
}

/**
 * How well `query` sits in a node's words, before weight, boost and frecency:
 *
 *   the title holds it as typed (a word start scores more)      TITLE_EXACT (+ TITLE_WORD)
 *   the title holds its letters, tightly or as word initials     the fuzzy score
 *   a keyword or the category holds it as typed                  the fuzzy score - KEYWORD_COST
 *
 * Anything looser is no match. Letters picked one by one across several keywords ("marco" from
 * "mail write compose") or strewn across a whole title are what a person typing a name did NOT
 * mean, and they used to outrank the name itself.
 */
const TITLE_EXACT = 40;
const TITLE_WORD = 20;
const KEYWORD_COST = 24;

/** A subsequence match is kept only while its gaps are no more than the letters it matched. */
function tight(positions: number[]): boolean {
  const first = positions[0] ?? 0;
  const last = positions[positions.length - 1] ?? 0;
  return last - first + 1 - positions.length <= positions.length;
}

/** Word initials: every matched letter starts a word ("mu" in "Mark unread"). */
function initials(title: string, positions: number[]): boolean {
  return positions.every((p) => p === 0 || /[\s\-_/.:▸·]/.test(title[p - 1] ?? ""));
}

function textMatch(
  query: string,
  node: CommandNode,
): { score: number; positions: number[] } | null {
  const onTitle = fuzzyMatch(query, node.title);
  if (onTitle && query.length > 0) {
    const at = node.title.toLowerCase().indexOf(query.toLowerCase());
    if (at >= 0) {
      const wordStart = at === 0 || /[\s\-_/.:▸·]/.test(node.title[at - 1] ?? "");
      const positions = Array.from({ length: query.length }, (_, i) => at + i);
      const bonus = TITLE_EXACT + (wordStart ? TITLE_WORD : 0);
      return { score: onTitle.score + bonus, positions };
    }
    if (tight(onTitle.positions) || initials(node.title, onTitle.positions)) return onTitle;
  }
  if (query.length === 0) return { score: 0, positions: [] };
  const q = query.toLowerCase();
  const words = [node.category, ...(node.keywords ?? [])].filter((w): w is string => Boolean(w));
  if (words.some((w) => w.toLowerCase().includes(q))) {
    const onHay = fuzzyMatch(query, words.join(" "));
    return { score: (onHay?.score ?? 0) - KEYWORD_COST, positions: [] };
  }
  return null;
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

      const match = textMatch(query, node);
      if (match === null) continue;
      const { score: fuzzyScore, positions } = match;

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
