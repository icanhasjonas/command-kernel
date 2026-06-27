#!/usr/bin/env bun
/**
 * Build all packages, rewrite `workspace:*` deps to the monorepo version, and
 * `npm publish` each package in dependency order. Dry-run by default; pass
 * `--go` to actually publish.
 *
 *   bun scripts/publish.ts          # dry-run (shows what would publish)
 *   bun scripts/publish.ts --go     # real publish to npm
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const dryRun = !process.argv.includes("--go");

const PACKAGES = ["core", "agent", "ui"] as const;

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const rootPkg = readJson(resolve(ROOT, "package.json"));
const version = rootPkg.version as string;
if (!version) {
  console.error("No version in root package.json");
  process.exit(1);
}

console.log(`Publishing v${version}${dryRun ? " (DRY RUN)" : ""}\n`);

// build all packages
console.log("Building packages...");
execSync("bun run build:packages", { cwd: ROOT, stdio: "inherit" });
console.log();

for (const pkg of PACKAGES) {
  const dir = resolve(ROOT, "packages", pkg);
  const pkgPath = resolve(dir, "package.json");
  const pkgJson = readJson(pkgPath);
  const original = readFileSync(pkgPath, "utf8");

  // rewrite workspace:* to the monorepo version
  pkgJson.version = version;
  for (const depKey of ["dependencies", "peerDependencies", "devDependencies"] as const) {
    const deps = pkgJson[depKey];
    if (!deps) continue;
    for (const [name, ver] of Object.entries(deps)) {
      if (ver === "workspace:*") {
        deps[name] = version;
      }
    }
  }

  // apply publishConfig.exports over exports
  if (pkgJson.publishConfig?.exports) {
    pkgJson.exports = pkgJson.publishConfig.exports;
    delete pkgJson.publishConfig;
  }

  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
  console.log(`@command-kernel/${pkg} v${version}`);

  try {
    const args = dryRun ? "--dry-run" : "";
    execSync(`npm publish --access public ${args}`.trim(), {
      cwd: dir,
      stdio: "inherit",
    });
  } finally {
    // restore original package.json
    writeFileSync(pkgPath, original);
  }
  console.log();
}

console.log(dryRun ? "Dry run complete. Pass --go to publish for real." : "Published.");
