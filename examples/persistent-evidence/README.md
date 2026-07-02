# persistent-evidence

**SEAM #3 (`EvidenceStore`) + SEAM #4 (`PolicyStore`), file-backed.** Plain JSON
via `node:fs` -- headless, no browser, no localStorage. Both implement the exact
core interfaces, so `createKernel({ evidence, policy })` wires them in.
`src/stores.ts` has the two stores; each "session" in the demo is a fresh
`createKernel` pointed at the same files, i.e. what a restart sees.

## The honest persistence story

| Seam | What it is | Survives a restart? |
|---|---|---|
| `PolicyStore` | standing "always allow" rule | **Yes** -- a standing exception is meant to. Clean, useful persistence. |
| `EvidenceStore` | a per-act **grant** (approval) | **No, by design.** A grant is a hash over the call + a per-session **salt**. The bytes persist; a new session has a new salt, so the grant no longer verifies. |

That is the security property: an approval can't be replayed past the session it
was given in (a browser reload rotates the salt for free). `persistSalt: true`
keeps the salt too, so grants replay across restarts -- **at the cost** of that
property (a stolen grant file then replays forever). Off by default, on purpose.

## Run it

```bash
bun run --filter '@command-kernel/example-persistent-evidence' start
# or
bun examples/persistent-evidence/src/index.ts
```

Three acts: (1) a saved grant is present on disk but is refused in a new session,
(2) an always-allow rule reloads and auto-approves with no grant, (3)
`persistSalt: true` replays the grant -- with the tradeoff stated out loud.

## Test

```bash
bun test examples/persistent-evidence
```
