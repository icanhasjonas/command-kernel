import type { CommandNode, Ctx, Ranked } from "@command-kernel/core";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

/**
 * What a source has for a query: its rows, and optionally a note the palette draws under the
 * list (where the search stands: "Searching…", "That is every match", why it failed).
 */
export interface PaletteFound {
  rows: readonly CommandNode[];
  note?: ReactNode;
  /**
   * Ids of rows that keep the palette open when they run ("Load more", "Try again"): their
   * run changes what this source shows, through `update`, instead of finishing the palette.
   */
  keepOpen?: readonly string[];
}

/** A source's answer: its rows, or its rows with a note. */
export type PaletteAnswer = readonly CommandNode[] | PaletteFound;

/**
 * A host's own search, run at the palette's root alongside the commands: the threads whose
 * text matches, the orders with this number. Each hit is a CommandNode, so it behaves like
 * any row: `run` runs it (through the kernel's gate), `resolve` drills into it, `subject` puts
 * it in hand for a pipe.
 */
export interface PaletteSource {
  /** stable id: the palette keys its searches by it */
  id: string;
  /** the heading its rows sit under (a row's own `category` wins) */
  group?: string;
  /** the shortest query that runs it (default 2) */
  minQuery?: number;
  /**
   * The rows for a query, best first. `signal` aborts when the query moves on, so a host can
   * cancel its request; a slow answer for an old query is dropped either way. A throw is no rows.
   * `update` replaces the answer later, as often as the search has news (a "Searching…" note
   * first, the hits once they come, a next page), until `signal` aborts.
   */
  search(
    query: string,
    ctx: Ctx,
    signal: AbortSignal,
    update: (answer: PaletteAnswer) => void,
  ): PaletteAnswer | Promise<PaletteAnswer>;
}

/** What the sources have for the query on screen. */
export interface SourcesFound {
  /** every source's rows, in the sources' order */
  rows: Ranked[];
  /** every source's note, in the sources' order */
  notes: { id: string; note: ReactNode }[];
  /** the row runs without closing the palette (see `PaletteFound.keepOpen`) */
  keepsOpen: (node: CommandNode) => boolean;
}

interface Held {
  rows: Ranked[];
  note?: ReactNode;
  keepOpen: ReadonlySet<string>;
}

const asRow = (source: PaletteSource, node: CommandNode): Ranked => ({
  node: node.category === undefined && source.group ? { ...node, category: source.group } : node,
  score: 0,
  positions: [],
});

const held = (source: PaletteSource, answer: PaletteAnswer): Held => {
  const found: PaletteFound = Array.isArray(answer)
    ? { rows: answer as readonly CommandNode[] }
    : (answer as PaletteFound);
  return {
    rows: found.rows.map((node) => asRow(source, node)),
    ...(found.note !== undefined && { note: found.note }),
    keepOpen: new Set(found.keepOpen ?? []),
  };
};

const NONE: SourcesFound = { rows: [], notes: [], keepsOpen: () => false };

/**
 * Runs every `PaletteSource` for the root query, latest query wins. Its rows land after the
 * commands, in each source's own order: they never move a row that is already on screen, so
 * Enter does not wait for them. A source's last answer stays until it answers the new query.
 */
export function usePaletteSources({
  sources,
  ctx,
  query,
  active,
}: {
  sources: readonly PaletteSource[];
  ctx: Ctx;
  query: string;
  /** only at the root, browsing */
  active: boolean;
}): SourcesFound {
  const [answers, setAnswers] = useState<ReadonlyMap<string, Held>>(new Map());
  // the latest sources, read by the search without re-running it when the host re-creates them
  const latest = useRef(sources);
  latest.current = sources;
  const key = sources.map((s) => s.id).join("\n");
  const q = query.trim();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `sources`
  useEffect(() => {
    const live = latest.current.filter((s) => q.length >= (s.minQuery ?? 2));
    const ids = new Set(live.map((s) => s.id));
    // a source that does not run for this query has nothing to show for it
    setAnswers((now) =>
      [...now.keys()].some((id) => !ids.has(id) || !active)
        ? new Map([...now].filter(([id]) => active && ids.has(id)))
        : now,
    );
    if (!active || live.length === 0) return;
    const abort = new AbortController();
    for (const s of live) {
      const take = (answer: PaletteAnswer) => {
        if (abort.signal.aborted) return;
        setAnswers((now) => new Map(now).set(s.id, held(s, answer)));
      };
      const none = () => take([]);
      try {
        const answer = s.search(q, ctx, abort.signal, take);
        if (answer instanceof Promise) answer.then(take, none);
        else take(answer);
      } catch {
        none();
      }
    }
    return () => abort.abort();
  }, [active, q, key, ctx]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `sources`
  return useMemo(() => {
    if (!active || answers.size === 0) return NONE;
    // in the sources' order, whatever order they answered in
    const ordered = latest.current.flatMap((s) => {
      const a = answers.get(s.id);
      return a ? [{ id: s.id, ...a }] : [];
    });
    return {
      rows: ordered.flatMap((a) => a.rows),
      notes: ordered.flatMap((a) => (a.note === undefined ? [] : [{ id: a.id, note: a.note }])),
      keepsOpen: (node: CommandNode) => ordered.some((a) => a.keepOpen.has(node.id)),
    };
  }, [active, answers, key]);
}
