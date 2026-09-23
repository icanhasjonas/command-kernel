/**
 * A small fzf-flavoured fuzzy matcher.
 *
 * Returns a score AND the matched character offsets (so the UI can highlight).
 * Scoring mirrors fzf's shape: a base per-match reward, bonuses at word
 * boundaries / camelCase transitions / consecutive runs, penalties for gaps.
 * Not the full Smith-Waterman DP - a greedy left-to-right pass that is more
 * than good enough for a command list and keeps the positions trivial.
 */

const SCORE_MATCH = 16;
const BONUS_BOUNDARY = 14; // match right after a separator
const BONUS_CAMEL = 10; // lower->Upper transition
const BONUS_CONSECUTIVE = 8; // adjacent to the previous match
const BONUS_FIRST = 12; // very first char of the haystack
const PENALTY_GAP_START = -3;
const PENALTY_GAP_EXTEND = -1;

const SEPARATORS = new Set([" ", "-", "_", "/", ".", ":", "▸"]);

function isBoundary(prev: string | undefined): boolean {
  return prev === undefined || SEPARATORS.has(prev);
}

function isCamel(prev: string | undefined, cur: string): boolean {
  if (prev === undefined) return false;
  return prev === prev.toLowerCase() && cur === cur.toUpperCase() && cur !== cur.toLowerCase();
}

export interface FuzzyResult {
  score: number;
  positions: number[];
}

/**
 * Match `query` against `haystack`. Returns null on no match.
 * Empty query => neutral match (score 0, no positions) so the full list shows.
 */
export function fuzzyMatch(query: string, haystack: string): FuzzyResult | null {
  if (query.length === 0) return { score: 0, positions: [] };

  const q = query.toLowerCase();
  const h = haystack;
  const hl = haystack.toLowerCase();

  let score = 0;
  let qi = 0;
  let prevMatch = -2;
  const positions: number[] = [];

  for (let hi = 0; hi < hl.length && qi < q.length; hi++) {
    if (hl[hi] !== q[qi]) continue;

    let gained = SCORE_MATCH;
    const prevChar = hi > 0 ? h[hi - 1] : undefined;
    if (hi === 0) gained += BONUS_FIRST;
    if (isBoundary(prevChar)) gained += BONUS_BOUNDARY;
    if (h[hi] !== undefined && isCamel(prevChar, h[hi] as string)) gained += BONUS_CAMEL;
    if (hi === prevMatch + 1) gained += BONUS_CONSECUTIVE;

    score += gained;
    positions.push(hi);
    prevMatch = hi;
    qi++;
  }

  if (qi < q.length) return null; // not all query chars consumed

  // penalise the gaps between the first and last matched offset
  const first = positions[0] ?? 0;
  const last = positions[positions.length - 1] ?? 0;
  const span = last - first + 1;
  const gaps = span - positions.length;
  if (gaps > 0) {
    score += PENALTY_GAP_START + PENALTY_GAP_EXTEND * (gaps - 1);
  }

  return { score, positions };
}
