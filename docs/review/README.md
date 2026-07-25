# Command Kernel — full review, 2026-07-25

A read of every source file in `packages/`, `examples/`, `test/`, and the docs,
against the mission in `CLAUDE.md`: *a reusable, extensible, documented,
example-backed monorepo where the extension contract is the product.*

Findings are split by area. Each one has evidence (a probe, a measurement, a file
and line), a severity, and a proposed fix. Nothing here is speculative — every
claim was either executed or read off the file.

| Document | Area |
|---|---|
| [`01-kernel.md`](01-kernel.md) | `@command-kernel/core` — correctness, trust core, API shape |
| [`02-ui-driver.md`](02-ui-driver.md) | `@command-kernel/ui` — bundle, UX, accessibility |
| [`03-packaging.md`](03-packaging.md) | what a consumer installs, release process, CI |
| [`04-docs-and-tests.md`](04-docs-and-tests.md) | README/GUIDE accuracy, examples, coverage |

## Already fixed on this pass

Three trust-core bugs, each with a regression test, in
`fix(core): bind grants to the args that actually run; enforce required args`:

| # | Bug | Impact |
|---|---|---|
| F1 | A grant was signed over the args a driver *submitted*, but the kernel runs *derived* args (`prefill` merge, entity auto-resolution). Verification never matched. | Any gated command with `prefill` or an entity arg was **unapprovable** — Allow, gate re-asks, forever. |
| F2 | `executeNode` validated present values but never checked required ones existed. | A driver calling the verb directly (the palette does) ran `run()` with a missing required arg. |
| F3 | `collectShortcuts` returns a `Map` keyed by shortcut string, so duplicates collapsed — and `validateShortcuts` took that `Map`. | The conflict detector could not see the conflicts it exists to report. |

## The backlog, ranked

Severity is about the shippable artifact, not about effort.

**P0 — blocks calling this shippable**

| # | Finding | Where |
|---|---|---|
| U1 | `import { CommandPalette }` costs **717 kB minified / 194 kB gzipped**; 537 kB of that is the whole Lucide icon set, pulled by a runtime string lookup. | [02](02-ui-driver.md#u1) |
| K13 | `FallbackSearch` is a documented, typed, configurable seam that **nothing implements** — no verb calls it. | [01](01-kernel.md#k13) |

**P1 — fix before publishing**

| # | Finding | Where |
|---|---|---|
| K2 | The evidence tag is 32-bit. A forged sig is brute-forceable in **~12 minutes** on one core, against the exact attacker the design names. | [01](01-kernel.md#k2) |
| K1 | A function provider is silently dropped when `roots()`/`chords()` are called without a `ctx`. | [01](01-kernel.md#k1) |
| K3 | An unresolvable path segment returns empty `completions`, indistinguishable from "nothing matched". | [01](01-kernel.md#k3) |
| U2 | Demo copy is hardcoded in the published palette (`"Backoffice"`, `"Everything lives here now"`). | [02](02-ui-driver.md#u2) |
| U3 | No accessibility: no combobox/listbox roles, no `aria-activedescendant`, no input label. | [02](02-ui-driver.md#u3) |
| U4 | Arrowing past the fold does not scroll the selected row into view. | [02](02-ui-driver.md#u4) |
| U5 | The "use *typed*" free-text row is unreachable by keyboard. | [02](02-ui-driver.md#u5) |
| U6 | `ConfirmPanel` labels every check "requires …", including informational and arg-error checks. | [02](02-ui-driver.md#u6) |
| P1 | The `ui` tarball ships a test harness that imports `happy-dom` (a devDependency) with an import side effect. | [03](03-packaging.md#p1) |
| P2 | `sideEffects: false` is untrue for `@command-kernel/ui`. | [03](03-packaging.md#p2) |
| P3 | `@radix-ui/react-tooltip` is a runtime dependency imported nowhere. | [03](03-packaging.md#p3) |
| D1 | The public README documents a private production app and links a sibling directory that doesn't exist on GitHub. | [04](04-docs-and-tests.md#d1) |

**P2 — polish, in rough value order**

K11 audit hook is blind to denials · K6 `kind:"entity"` vs `entity` ref can
disagree · K4 chords/shortcuts only scan roots · K10 `Ranker` is sync while
`GatePolicy` is async · U7 one cancellation token shared by two async streams ·
U13 `isMac` is frozen at import with no override · K9 an unknown role reads as
"below everything" · U9 debug chrome (`node.weight`) in a shipped row · K5
intermediate-segment args are second-class · K8 deeplink edge cases · U8 stale
frames when `roots` changes while open · U10 one `<span>` per character · U11
always-on window listeners · U12 two files over the repo's own size limit · K7
schema loses `multiple`/`validate` detail · P4 no repo/homepage/keywords
metadata · P5 two uncoordinated publish paths · P6 no bundle budget in CI · K12
`fuzzy`/`rank`/`registry`/`values`/`adapter` untested · D2 add
`ascii-box-balance` to the gate · D3 588 em-dashes against the repo's own rule ·
D4 "five seams" vs six.

## What is genuinely good

Worth saying plainly, because the list above is all defect:

- **The boundary is real.** `test/boundary.test.ts` checks dependency purity,
  import purity, DOM-global purity, and a sealed `exports` map. That is a
  structural guarantee, not a convention, and it holds.
- **`createKernel` costs 9.9 kB minified / 4.1 kB gzipped.** The hero is
  genuinely small. The weight problem is entirely in driver #1.
- **The seam defaults are right.** `createKernel({ roots })` is trivial and each
  seam overrides in isolation; the examples prove it from a consumer's side.
- **The gate is enforced in one place.** After F2, `executeNode` is the only door
  and it checks completeness, validity, role, and evidence in that order. The
  agent physically cannot self-approve, and the forge demo proves it.
- **The docblocks are unusually good** — they explain intent and trade-offs, not
  mechanics. Keep that. It is most of why this reads as a product.
