/**
 * SEAM #1 demo — the same query through the STOCK ranker and a CUSTOM one.
 *
 *   bun run --filter '@command-kernel/example-custom-ranker' start
 *   # or: bun examples/custom-ranker/src/index.ts
 *
 * Two kernels over the IDENTICAL eight commands. The only difference is the
 * `ranker` seam: one uses the default blend, the other `createPrefixRanker()`.
 * Same query "se", two orderings, printed side by side so the policy change is
 * visible — no forking, one config field.
 */
import { createKernel, rank } from "@command-kernel/core";
import { makeCtx, NODES } from "./fixtures";
import { createPrefixRanker } from "./ranker";

const ctx = makeCtx();
const QUERY = "se";

// two kernels, same nodes, different SEAM #1.
const stock = createKernel({ roots: NODES, ranker: rank });
const custom = createKernel({ roots: NODES, ranker: createPrefixRanker() });

async function order(kernel: ReturnType<typeof createKernel>): Promise<string[]> {
  const res = await kernel.command({ query: QUERY }, ctx);
  if (res.kind !== "completions") return [];
  return res.items.flatMap((i) => (i.kind === "command" ? [i.node.title] : []));
}

const stockOrder = await order(stock);
const customOrder = await order(custom);

function table(a: string[], b: string[]): void {
  const rows = Math.max(a.length, b.length);
  const pad = (s: string) => s.padEnd(22);
  console.log(`\nquery "${QUERY}" — frecency favours "Server logs" (8) and "Send email" (5)\n`);
  console.log(`  ${pad("default blend")}  custom prefix-first`);
  console.log(`  ${pad("-".repeat(21))}  ${"-".repeat(21)}`);
  for (let i = 0; i < rows; i++) {
    console.log(`  ${pad(a[i] ?? "")}  ${b[i] ?? ""}`);
  }
}

table(stockOrder, customOrder);

console.log(
  [
    "",
    "What changed:",
    `  - default top:  ${stockOrder[0]}   (weight 90 wins the single-number blend)`,
    `  - custom top:   ${customOrder[0]}   (a prefix hit, ordered by frecency)`,
    "  - custom pushes EVERY 'se...' prefix hit above 'Deploy service', which only",
    "    matches as a fuzzy subsequence — the default interleaves them by weight.",
    "",
  ].join("\n"),
);
