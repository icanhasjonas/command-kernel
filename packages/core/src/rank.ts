import { fuzzyMatch } from "./fuzzy";
import type { CommandNode, Ctx, Ranked } from "./types";

/**
 * The blend that turns a fuzzy match into a final rank:
 *
 *   final = fuzzyScore                       // how well the text matches
 *         + weight * W_WEIGHT                // static authoring priority
 *         + boost(ctx)                       // where-you-are relevance
 *         + frecency * W_FRECENCY            // learned recency*frequency
 *
 * The static weight + context boost are the "custom priority weights" knob.
 */
const W_WEIGHT = 1.1;
const W_FRECENCY = 6;

function haystack(node: CommandNode): string {
  return [node.title, node.category, ...(node.keywords ?? [])].filter(Boolean).join(" ");
}

export function rank(nodes: CommandNode[], query: string, ctx: Ctx): Ranked[] {
  const out: Ranked[] = [];

  for (const node of nodes) {
    if (node.when && !node.when(ctx)) continue;

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
}
