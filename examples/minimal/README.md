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
5. **Allow** → mint a grant via `kernel.evidence.grantForPath` → re-issue → result
6. a **forged** grant → bounces back to the gate (approval can't be fabricated)

That loop is identical for the palette, the agent, a deeplink, or this console —
which is the whole point. For the rich version, see
[`../playground`](../playground).
