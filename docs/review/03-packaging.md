# 03 — packaging, release, CI

What a consumer actually installs, and how it gets there.

---

## P1 — the `ui` tarball ships a test harness that imports a devDependency · **P1**

`npm pack --dry-run` in `packages/ui`:

```
dist/dom-setup.js        4.0kB
dist/dom-setup.d.ts
dist/dom-setup.js.map
src/dom-setup.ts         3.8kB
src/invokers.test.ts     5.9kB
src/palette.test.tsx     9.5kB
```

`dom-setup.ts` is the vendored happy-dom global registrator for `bun test`. It
top-level-imports `happy-dom` — a **devDependency** — and calls `registerDom()`
as an import side effect, mutating `globalThis`. It ships compiled into `dist`.

Nothing imports it from `index.ts`, and the `exports` map is sealed to `"."`, so
today it is unreachable and inert. It is still a module in the published artifact
that cannot resolve its own import, and if anything ever reaches it (a bundler
scanning `dist`, a consumer with `exports`-unaware tooling, a future re-export)
it fails or clobbers globals.

`packages/agent` ships its test files too. `packages/core` gets this right —
`"files": ["dist", "src", "!src/**/*.test.ts"]`.

**Fix.**

- Move `dom-setup.ts` to `packages/ui/test/` (outside `rootDir: "src"`) so it is
  never compiled to `dist`, or add it to `tsconfig.build.json`'s `exclude`.
- Add `"!src/**/*.test.ts"`, `"!src/**/*.test.tsx"` to the `files` array of `ui`
  and `agent`, matching core.
- Shipping `src` at all is intentional (`declarationMap` points into it, which is
  what makes go-to-definition land on real source) — worth a one-line comment in
  the manifests so nobody "cleans it up".

---

## P2 — `sideEffects: false` is untrue for `@command-kernel/ui` · **P1**

`index.ts` opens with:

```ts
// side-effect import: augments React's ButtonHTMLAttributes ...
import "./dom-command.js";
```

and the manifest says `"sideEffects": false`, which licenses a bundler to drop
exactly that import. `dom-command.ts` compiles to an empty module today (a
`declare module` block plus `import "react"`), so nothing breaks — but the
manifest is asserting something false, and the file's own docblock explains it is
a `.ts` rather than a `.d.ts` *specifically so it gets emitted*. Those two
decisions contradict each other.

**Fix.** Either `"sideEffects": ["./dist/dom-command.js"]`, or make the
augmentation a `.d.ts` referenced from the package's `types` so it is picked up
without a runtime import at all. The second is cleaner: type augmentation has no
business being a runtime module.

---

## P3 — a runtime dependency imported nowhere · **P1**

`@radix-ui/react-tooltip` is in `packages/ui`'s `dependencies`. Zero imports
across `packages/` and `examples/`. Every consumer installs it.

**Fix.** Remove it. Worth a `depcheck`/`knip` pass in `check:full` to stop the
next one.

---

## P4 — the manifests have no identity · **P2**

None of the three publishable packages declare `repository`, `homepage`, `bugs`,
`keywords`, or `author`. On npm that means no source link, no issues link, no
search surface. For a package whose pitch is "read it end to end", the missing
`repository` link is the worst of them.

**Fix.** Add all five to each manifest (`repository` with a `directory` field so
npm deep-links into the monorepo path). `publint` doesn't flag these, so nothing
currently catches it.

---

## P5 — two publish paths that don't know about each other · **P2**

`.changeset/` is configured (fixed versioning across the three packages, `access:
public`, `baseBranch: main`), and `scripts/publish.ts` independently reads the
root `package.json` version, rewrites `workspace:*`, applies `publishConfig`, and
calls `npm publish` per package.

They will disagree the first time either is used seriously: changesets bumps the
*package* versions and writes changelogs; `publish.ts` ignores both and stamps
every package with the *root* version. The root package is `private: true` and
its version is not maintained by changesets.

`publish.ts` also has no npm-auth/OTP handling, no `--provenance`, no dist-tag
control, and no guard against publishing a dirty tree.

**Fix.** Pick one. Changesets is already configured and handles versioning,
changelogs, and dependency bumps — keep it, and reduce `publish.ts` to what
changesets doesn't do (the `publishConfig.exports` swap, if `publishConfig`
alone isn't enough — it usually is, since npm applies `publishConfig` natively,
which may make the whole script unnecessary). Add `--provenance` and a
`git status --porcelain` guard to whatever survives.

---

## P6 — CI has no size budget · **P2**

`.github/workflows/ci.yml` runs `check:full` (biome, tsc, tests, builds,
publint, attw) on push and PR. Solid. But `report:bundle` exists as a script and
runs nowhere, and there is no threshold — which is why [U1](02-ui-driver.md#u1)
could reach 717 kB unnoticed.

There is also no release workflow: publishing is a local `bun scripts/publish.ts
--go` on someone's machine.

**Fix.**

- Add a `size` job: run `report:bundle`, fail if `@command-kernel/core` exceeds
  ~6 kB gzipped or `@command-kernel/ui` exceeds an agreed number (set it just
  above wherever U1 lands after the icon fix).
- Add a changesets release workflow (`changesets/action`) gated on the same
  `check:full`, with npm provenance.
- Consider a job that installs each packed tarball into a scratch project and
  imports it — the cheapest possible check that the published shape actually
  resolves, which `attw` approximates but doesn't execute.
