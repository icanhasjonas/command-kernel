#!/usr/bin/env bun
/**
 * Build all packages, put each in its published shape (scripts/package-shape.ts: dist
 * exports, `workspace:*` pinned to the monorepo version) and `npm publish` it, in
 * dependency order. Dry-run by default; pass `--go` to actually publish.
 *
 *   bun scripts/publish.ts          # dry-run (shows what would publish)
 *   bun scripts/publish.ts --go     # real publish to npm
 */
import { execSync } from "node:child_process";
import { PACKAGES, packageDir, ROOT, toPublishShape, version } from "./package-shape";

const dryRun = !process.argv.includes("--go");

if (!version) {
  console.error("No version in root package.json");
  process.exit(1);
}

console.log(`Publishing v${version}${dryRun ? " (DRY RUN)" : ""}\n`);

console.log("Building packages...");
execSync("bun run build:packages", { cwd: ROOT, stdio: "inherit" });
console.log();

for (const pkg of PACKAGES) {
  const restore = toPublishShape(pkg);
  console.log(`@command-kernel/${pkg} v${version}`);
  try {
    const args = dryRun ? "--dry-run" : "";
    execSync(`npm publish --access public ${args}`.trim(), {
      cwd: packageDir(pkg),
      stdio: "inherit",
    });
  } finally {
    restore();
  }
  console.log();
}

console.log(dryRun ? "Dry run complete. Pass --go to publish for real." : "Published.");
