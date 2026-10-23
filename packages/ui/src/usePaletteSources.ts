import type { CommandNode, Ctx, Ranked } from "@command-kernel/core";
import { useEffect, useRef, useState } from "react";

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
   */
  search(
    query: string,
    ctx: Ctx,
    signal: AbortSignal,
  ): readonly CommandNode[] | Promise<readonly CommandNode[]>;
}

const asRow = (source: PaletteSource, node: CommandNode): Ranked => ({
  node: node.category === undefined && source.group ? { ...node, category: source.group } : node,
  score: 0,
  positions: [],
});

/**
 * Runs every `PaletteSource` for the root query, latest query wins. Its rows land after the
 * commands, in each source's own order: they never move a row that is already on screen, so
 * Enter does not wait for them.
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
}): Ranked[] {
  const [rows, setRows] = useState<Ranked[]>([]);
  // the latest sources, read by the search without re-running it when the host re-creates them
  const latest = useRef(sources);
  latest.current = sources;
  const key = sources.map((s) => s.id).join("\n");
  const q = query.trim();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `sources`
  useEffect(() => {
    const live = latest.current.filter((s) => q.length >= (s.minQuery ?? 2));
    if (!active || live.length === 0) return setRows([]);
    const abort = new AbortController();
    Promise.all(
      live.map(async (s) => {
        try {
          const found = await s.search(q, ctx, abort.signal);
          return found.map((node) => asRow(s, node));
        } catch {
          return [];
        }
      }),
    ).then((found) => {
      if (!abort.signal.aborted) setRows(found.flat());
    });
    return () => abort.abort();
  }, [active, q, key, ctx]);

  return active ? rows : [];
}
