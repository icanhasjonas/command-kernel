#!/usr/bin/env bun
/**
 * Package-publish lint. For each publishable package, validate the artifact a
 * consumer actually installs -- not the dev shape.
 *
 *   bun scripts/lint-pkg.ts          # publint + attw on all three packages
 *
 * The dev `exports` point at `./src/*.ts` so the monorepo + examples consume the
 * TypeScript source directly (no build in the dev loop). What SHIPS is the
 * `publishConfig.exports` shape, pointing at `./dist`. So before packing, we
 * apply that transform in place (publishConfig -> exports, workspace:* -> the
 * monorepo version) exactly like scripts/publish.ts, run the linters, then
 * restore the original manifest. Requires `bun run build:packages` first.
 *
 * publint is a hard gate. attw is a hard gate too, with one documented carve-out:
 *   - `--profile esm-only` ignores the CJS resolutions (these packages are ESM-only).
 *   - ui's `./theme.css` entrypoint is excluded: attw only understands JS/types
 *     entrypoints, so a CSS subpath is a false "NoResolution". It resolves fine
 *     in a bundler (Vite/Tailwind), which is the only place a CSS import runs.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PACKAGES = ["core", "agent", "ui"] as const;

const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const version = rootPkg.version as string;

function run(cmd: string, args: string[], cwd: string): boolean {
  try {
    execFileSync(cmd, args, { cwd, stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

/** Rewrite a manifest in place to its published shape; returns the original text. */
function toPublishShape(pkgPath: string): string {
  const original = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(original);
  pkg.version = version;
  for (const key of ["dependencies", "peerDependencies", "devDependencies"] as const) {
    const deps = pkg[key];
    if (!deps) continue;
    for (const [name, ver] of Object.entries(deps)) {
      if (ver === "workspace:*") deps[name] = version;
    }
  }
  if (pkg.publishConfig?.exports) {
    pkg.exports = pkg.publishConfig.exports;
    delete pkg.publishConfig;
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return original;
}

let ok = true;

for (const name of PACKAGES) {
  const dir = resolve(ROOT, "packages", name);
  const pkgPath = resolve(dir, "package.json");
  console.log(`\n===== @command-kernel/${name} =====`);

  const original = toPublishShape(pkgPath);
  try {
    const publintOk = run("bun", ["x", "publint", dir], ROOT);

    const attwArgs = ["x", "attw", "--pack", dir, "--profile", "esm-only"];
    if (name === "ui") attwArgs.push("--exclude-entrypoints", "./theme.css");
    const attwOk = run("bun", attwArgs, ROOT);

    if (!publintOk || !attwOk) ok = false;
  } finally {
    writeFileSync(pkgPath, original);
  }
}

if (!ok) {
  console.error("\nPackage lint FAILED.");
  process.exit(1);
}
console.log("\nPackage lint passed (publint + attw, ESM-only profile).");
