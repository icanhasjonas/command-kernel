import type { CommandNode, Ctx, Entity, Kernel, Ranked } from "@command-kernel/core";
import { useEffect, useRef, useState } from "react";

const PER_TYPE = 4;

/** An entity found by search, as a row that stands for it: pick it, then say what to do with it. */
const subjectNode = (type: string, e: Entity): CommandNode => ({
  id: `subject:${e.type ?? type}:${e.id}`,
  title: e.label,
  ...(e.hint !== undefined && { subtitle: e.hint }),
  ...(e.icon !== undefined && { icon: e.icon }),
  subject: {
    type: { kind: "entity", entity: { type: e.type ?? type } },
    value: e.id,
    label: e.label,
  },
});

/**
 * Things, not only commands: at the root, a query is also run against the entity types
 * the app names (`subjects`), and each hit is a row standing for that thing. Picking one
 * puts it in hand and lists what can take it (a pipe). Results land after the commands.
 */
export function usePaletteSubjects({
  kernel,
  ctx,
  query,
  active,
  types,
}: {
  kernel: Kernel;
  ctx: Ctx;
  query: string;
  /** only at the root, browsing */
  active: boolean;
  types: readonly string[];
}): { rows: Ranked[]; fresh: boolean } {
  const [rows, setRows] = useState<Ranked[]>([]);
  // the query the rows were found for: Enter waits until they are this query's
  const [rowsFor, setRowsFor] = useState("");
  // its own "latest query wins" counter: a slow search must not cancel a frame's
  const token = useRef(0);
  const q = query.trim();
  const key = types.join(",");
  const searching = active && q.length >= 2 && Boolean(kernel.entities) && types.length > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `types`
  useEffect(() => {
    const registry = kernel.entities;
    if (!searching || !registry) return setRows([]);
    const mine = ++token.current;
    Promise.all(
      types.map((t) =>
        registry
          .search(t, q, ctx, { limit: PER_TYPE })
          .then((hits) => hits.map((e) => subjectNode(t, e)))
          .catch(() => []),
      ),
    ).then((found) => {
      if (mine !== token.current) return;
      setRows(found.flat().map((node) => ({ node, score: 0, positions: [] })));
      setRowsFor(q);
    });
  }, [searching, q, key, ctx, kernel]);

  return { rows: searching ? rows : [], fresh: !searching || rowsFor === q };
}
