# 04 — docs, examples, tests

---

## D1 — the public README documents a private application · **P1**

`README.md` has a **"First consumer: portal2"** section that:

- links `[portal2](../portal2)` — a sibling directory on one machine, a dead link
  on GitHub and on npm
- describes it as *"a production Cloudflare Workers application managing
  surrogacy-agency portals"*
- enumerates internal ticket ids (U1-U7) with no external referent
- points at `packages/command-kernel-core/PROVENANCE.md`, a path that does not
  exist in this repo

For a package about to be published, this is a private client's domain in the
front-page README of a public artifact, plus three broken links.

**Fix.** Cut it, or reduce it to one honest line without the client detail
("dogfooded in a production Cloudflare Workers app; the strict-TS and palette
export fixes came from that use") and drop the ticket ids and the relative
links. The dogfooding claim is worth keeping — it is real evidence the seams
survive contact — but it can be made without naming the customer or linking a
directory only you have.

---

## D2 — ASCII drift, now gated · **P2**

The hero diagram in `README.md` was ragged: box rows measured 58/59/60/61
characters against a 58-wide border. Fixed on this pass with
`ascii-box-balance --fix`.

Since the repo leans on box drawing in `README.md`, `CLAUDE.md`, `GUIDE.md`, and
several docblocks, it will drift again.

**Fix.** Add `ascii-box-balance` (or an equivalent width check) to `check:full`
so a ragged box fails CI the way a lint error does.

---

## D3 — 588 em-dashes, against the repo's own rule · **P2**

`CLAUDE.md` under **Code principles**:

> **No em-dashes** in code, comments, or prose. Use `-` or `--`.

```
$ grep -ro "—" --include='*.ts' --include='*.tsx' --include='*.md' \
    packages examples docs test *.md | wc -l
588
```

Every docblock and every README uses them heavily. So the rule is currently
decorative, which is worse than not having it — a stated rule that the codebase
ignores teaches every future contributor (and every agent reading `CLAUDE.md`)
that the rules in that file are optional.

**Fix.** Decide. Either a mechanical sweep (`—` → `--`, one commit, no semantic
review needed) plus a biome/grep check in the gate, or delete the rule from
`CLAUDE.md`. Both are defensible; the current state isn't.

---

## D4 — "five seams" vs six · **P2**

`packages/core/src/index.ts:11` says *"Around the verb sit FIVE documented
extension SEAMS"* and lists Ranker, GatePolicy, EvidenceStore, PolicyStore,
Registry. `CLAUDE.md`, the root `README.md`, and `create-kernel.ts` all document
**six** — entities (seam #6) is missing from the index docblock, and
`packages/core/README.md`'s table of contents still says "The five seams".

Small, but it is the public entry point's docblock, which is the first thing a
reader of the package sees.

---

## Examples

The example set is genuinely good — `minimal`, `custom-ranker`,
`persistent-evidence`, and `mcp-server` each isolate one seam and compose the
packages the way a third party would. Two gaps:

- **No example exercises the `ui` package outside the playground.** The playground
  is 1,700 lines of demo chrome; a consumer wanting "how do I mount this palette
  in my app" has to read past all of it. A ~40-line `examples/palette-minimal`
  (one kernel, three commands, `<CommandPalette>`, nothing else) would be the
  single highest-value addition, and it would have surfaced
  [U2](02-ui-driver.md#u2) immediately.
- **No example of a custom `GatePolicy`.** Seam #2 is the one with real security
  weight, and it is the only seam with no worked example. Ownership-based or
  time-window rules would show what a non-ladder policy looks like.

---

## Test coverage

182 tests, all green, and the trust-core paths are well covered — `command`,
`gate`, `evidence`, `policy`, `create-kernel`, `disambiguation`, `listof`,
`audit`, and the boundary test all pin real behaviour. The regression tests added
this pass (`grant-binding`, `required-args`) sit alongside them.

Gaps, in value order:

| Gap | Why it matters |
|---|---|
| `rank.ts` has no test | Seam #1, the default blend. Its weights and tie-break order are unfalsifiable. |
| `fuzzy.ts` has no test | Every scoring property in its docblock (boundary, camel, consecutive, gap) is unverified. |
| `registry.ts` has no test | Including the silent lazy-provider drop, [K1](01-kernel.md#k1). |
| `values.ts` has no test | Three tiny functions that the whole `multiple`-arg feature rests on. |
| `agent/adapter.ts` has no test | `pickTool` is the example seam an integrator replaces first. |
| Palette keyboard nav | `palette.test.tsx` covers browse/drill/args/gate through the hook, but never ArrowDown/Enter/Escape through `onKeyDown` — which is where [U5](02-ui-driver.md#u5) lives. |
| Multi-value (`multiple`) arg accumulation in the palette | The `commitArg`/`finishArg` branch is untested at the UI level. |
| `confirmAlways` / policy path in the palette | `confirmProceed` is tested; the always-allow branch isn't. |

Nothing here is a correctness emergency — it is the difference between "the
tests document the contract" and "the tests document most of the contract".
