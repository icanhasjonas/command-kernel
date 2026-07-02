import { expect, test } from "bun:test";
import { rank } from "@command-kernel/core";
import { makeCtx, NODES } from "./fixtures";
import { createPrefixRanker } from "./ranker";

const custom = createPrefixRanker();
const titles = (r: { node: { title: string } }[]) => r.map((x) => x.node.title);

test("prefix hits beat weight: frecency picks the top, not the heavy node", () => {
  const ctx = makeCtx();
  // default: the weight-90 "Settings" wins the single-number blend.
  expect(titles(rank(NODES, "se", ctx))[0]).toBe("Settings");
  // custom: a literal prefix hit, ordered by frecency ("Server logs" = 8).
  expect(titles(custom(NODES, "se", ctx))[0]).toBe("Server logs");
});

test("every prefix hit outranks a non-prefix fuzzy hit, whatever its weight", () => {
  const ordered = titles(custom(NODES, "se", ctx()));
  // "Deploy service" (weight 40) only matches as a subsequence -> dead last.
  expect(ordered[ordered.length - 1]).toBe("Deploy service");
  const prefixHits = ordered.filter((t) => t.toLowerCase().startsWith("se"));
  const worstPrefixRank = Math.max(...prefixHits.map((t) => ordered.indexOf(t)));
  expect(worstPrefixRank).toBeLessThan(ordered.indexOf("Deploy service"));

  // and the default does NOT honour that tier: weight lifts "Deploy service"
  // above at least one prefix hit.
  const def = titles(rank(NODES, "se", ctx()));
  expect(def.indexOf("Deploy service")).toBeLessThan(def.indexOf("Set reminder"));
});

test("prefix highlight offsets cover the typed run", () => {
  const res = custom(NODES, "se", ctx());
  const settings = res.find((r) => r.node.id === "settings");
  expect(settings?.positions).toEqual([0, 1]);
});

function ctx() {
  return makeCtx();
}
