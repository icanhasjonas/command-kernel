#!/usr/bin/env bun
/**
 * Package-publish lint. For each publishable package, validate the artifact a
 * consumer actually installs -- not the dev shape: the package is packed in its
 * published shape (scripts/package-shape.ts, the same one publish.ts ships) and
 * publint + attw run on that tarball. Requires `bun run build:packages` first.
 *
 *   bun scripts/lint-pkg.ts          # publint + attw on every package
 *
 * publint is a hard gate. attw is a hard gate too, with the carve-outs documented
 * on `lintTarball`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintTarball, PACKAGES, packTo } from "./package-shape";

const dest = mkdtempSync(join(tmpdir(), "ck-lint-pkg-"));
let ok = true;
try {
  for (const name of PACKAGES) {
    console.log(`\n===== @command-kernel/${name} =====`);
    if (!lintTarball(name, packTo(name, dest))) ok = false;
  }
} finally {
  rmSync(dest, { recursive: true, force: true });
}

if (!ok) {
  console.error("\nPackage lint FAILED.");
  process.exit(1);
}
console.log("\nPackage lint passed (publint + attw, ESM-only profile).");
