/**
 * SEAM #1 — a custom `Ranker`.
 *
 * The stock `createRanker()` blends fuzzy score + weight + boost + frecency into
 * ONE number and sorts by it, so a heavy-weight node can outrank an exact-prefix
 * hit. This ranker enforces a hard TIER instead:
 *
 *   tier 1  every title that STARTS WITH the query (case-insensitive)
 *   tier 2  the rest, matched as a fuzzy subsequence
 *
 * Any prefix hit outranks any non-prefix hit, regardless of authoring weight.
 * Inside a tier, ties break by frecency (the recency*frequency the host learned),
 * then by shorter title, then alphabetically. That is a genuinely different
 * policy — "what I literally typed, ordered by what I use most" — not a re-tuning
 * of the default weights.
 *
 * It implements the exact `Ranker` signature, so `createKernel({ ranker })` wires
 * it in with zero other changes.
 */
import {
  type CommandNode,
  type Ctx,
  fuzzyMatch,
  type Ranked,
  type Ranker,
} from "@command-kernel/core";

/** A floor so big any prefix hit sits above any fuzzy-only hit. */
const PREFIX_TIER = 1_000_000;

function visible(node: CommandNode, ctx: Ctx): boolean {
  if (node.when && !node.when(ctx)) return false;
  const hidden = typeof node.hide === "function" ? node.hide(ctx) : node.hide;
  return !hidden;
}

/** Exact-prefix-first, then fuzzy, ties broken by learned frecency. */
export function createPrefixRanker(): Ranker {
  return (nodes, query, ctx) => {
    const q = query.trim().toLowerCase();
    const out: Ranked[] = [];

    for (const node of nodes) {
      if (!visible(node, ctx)) continue;
      const frec = ctx.frecency[node.id] ?? 0;

      // tier 1 — literal prefix. positions are the leading run for highlight.
      if (q.length > 0 && node.title.toLowerCase().startsWith(q)) {
        const positions = Array.from({ length: q.length }, (_, i) => i);
        out.push({ node, score: PREFIX_TIER + frec, positions });
        continue;
      }

      // tier 2 — fuzzy subsequence (reuse the core matcher for score + offsets).
      const m = fuzzyMatch(query, node.title);
      if (m === null) continue;
      out.push({ node, score: m.score + frec, positions: m.positions });
    }

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
