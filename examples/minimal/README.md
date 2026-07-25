# minimal

The smallest example: register a couple of commands and drive them through the
kernel + gate — no React, no DOM, no framework. ~60 lines, one file.

```bash
bun run --filter '@command-kernel/minimal' start
# or
bun examples/minimal/src/index.ts
```

It walks the whole loop a driver implements:

1. **register** commands (`createKernel({ roots })`)
2. **browse** — `command({ query })` → ranked completions
3. **execute** an ungated command → a result
4. **execute** a gated command with no evidence → a `gate`
5. **Allow** → mint a grant from the gate response via `kernel.grantFor(res)` → re-issue → result
6. a **forged** grant → bounces back to the gate (approval can't be fabricated)
7. **deeplink** (driver #4) — `serializePath` / `parseDeeplink`: the same path as a
   URL; a gated deeplink still lands at the gate (a URL can't carry a grant)
8. **validation** — a hallucinated email is rejected before the gate, as an `args`
   response carrying the error
9. **entities** (seam #6) — an entity-typed arg completes from a registered catalog
10. **the projection** — what an *agent* sees: 4 generic tools (`search`/`resolve`/
    `execute`/`discover`), the same verbs the human palette calls, via `createProjection`

That loop is identical for the palette, the agent, a deeplink, or this console —
which is the whole point. For the rich version, see
[`../playground`](../playground).
