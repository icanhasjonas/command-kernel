import type { Ranked } from "@command-kernel/core";

/** A run of rows under one heading: a node's `category`, or none. */
export interface RowGroup<T extends Ranked> {
  /** the heading; undefined for rows that name no category */
  label: string | undefined;
  /** the index of the group's first row in the whole list (the keyboard's index) */
  start: number;
  rows: T[];
}

/**
 * Rows grouped by category, in rank order: each category sits where its best row ranked, and
 * keeps its rows in their own order. The best row stays first, so Enter on a fresh query still
 * runs the top match; the keyboard walks the list in exactly the order it is drawn.
 */
export function groupRanked<T extends Ranked>(rows: readonly T[]): T[] {
  const groups = new Map<string | undefined, T[]>();
  for (const row of rows) {
    const key = row.node.category;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].flat();
}

/** The headed runs of an already grouped list (see `groupRanked`). */
export function rowGroups<T extends Ranked>(rows: readonly T[]): RowGroup<T>[] {
  const out: RowGroup<T>[] = [];
  rows.forEach((row, i) => {
    const last = out[out.length - 1];
    if (last && last.label === row.node.category) last.rows.push(row);
    else out.push({ label: row.node.category, start: i, rows: [row] });
  });
  return out;
}
