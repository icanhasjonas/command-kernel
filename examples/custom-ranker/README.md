# custom-ranker

**SEAM #1 — the `Ranker`.** Swap how completions are ordered without touching
the kernel, the nodes, or any driver. `createKernel({ ranker })` is the only
change.

The stock `createRanker()` blends fuzzy score + weight + boost + frecency into
one number and sorts by it, so a heavy `weight` can outrank an exact-prefix hit.
`src/ranker.ts` replaces that with a hard TIER policy:

1. every title that literally **starts with** the query, then
2. everything else, matched as a fuzzy subsequence,

ties broken by the host-learned **frecency**. Result: "what I typed, ordered by
what I use most" -- a different policy, not a re-tuning of the defaults.

## Why you'd swap it

Prefix-first ranking, a BM25 index, alphabetical, a learned model, "recent
first" -- ranking is a product decision. It lives behind one interface so you
bring yours instead of forking the engine.

## Run it

```bash
bun run --filter '@command-kernel/example-custom-ranker' start
# or
bun examples/custom-ranker/src/index.ts
```

Same query `"se"` through two kernels, side by side: the default tops out at the
weight-90 `Settings`; the custom ranker tops out at `Server logs` (a prefix hit,
frecency 8) and buries the non-prefix `Deploy service` last.

## Test

```bash
bun test examples/custom-ranker
```
