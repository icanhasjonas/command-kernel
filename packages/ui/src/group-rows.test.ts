import { describe, expect, it } from "bun:test";
import type { Ranked } from "@command-kernel/core";
import { groupRanked, rowGroups } from "./group-rows.js";

const row = (id: string, category?: string): Ranked => ({
  node: { id, title: id, ...(category !== undefined && { category }) },
  score: 0,
  positions: [],
});
const ids = (rows: Ranked[]) => rows.map((r) => r.node.id);

describe("groupRanked", () => {
  it("gathers each category where its best row ranked, keeping rank order inside it", () => {
    const rows = [row("a", "Users"), row("b", "Actions"), row("c", "Users"), row("d"), row("e")];
    expect(ids(groupRanked(rows))).toEqual(["a", "c", "b", "d", "e"]);
  });

  it("keeps the top match first, so Enter on a fresh query still runs it", () => {
    const rows = [row("top", "Navigate"), row("x", "Users"), row("y", "Navigate")];
    expect(groupRanked(rows)[0]?.node.id).toBe("top");
  });

  it("changes nothing for a list with no categories", () => {
    const rows = [row("a"), row("b"), row("c")];
    expect(ids(groupRanked(rows))).toEqual(["a", "b", "c"]);
  });
});

describe("rowGroups", () => {
  it("cuts a grouped list into headed runs that know their first index", () => {
    const groups = rowGroups(groupRanked([row("a", "Users"), row("b"), row("c", "Users")]));
    expect(groups.map((g) => [g.label, g.start, ids(g.rows)])).toEqual([
      ["Users", 0, ["a", "c"]],
      [undefined, 2, ["b"]],
    ]);
  });

  it("is empty for no rows", () => {
    expect(rowGroups([])).toEqual([]);
  });
});
