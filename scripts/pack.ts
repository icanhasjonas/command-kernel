#!/usr/bin/env bun
/**
 * Build the packages and write installable tarballs: exactly what `npm publish` would
 * ship (built `dist/`, `publishConfig.exports` applied, `workspace:*` pinned), each one
 * linted (publint + attw) before it is reported. For a consumer that installs a package
 * before it is on npm: `"@command-kernel/core": "file:./path/command-kernel-core-0.1.0.tgz"`.
 *
 *   bun scripts/pack.ts <dest> [core,wire,...]   # default: every package
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { lintTarball, PACKAGES, type PackageName, packTo, ROOT } from "./package-shape";

const [destArg, onlyArg] = process.argv.slice(2);
if (!destArg) {
  console.error("Usage: bun scripts/pack.ts <dest> [core,wire,...]");
  process.exit(1);
}
const dest = resolve(process.cwd(), destArg);
const known = new Set<string>(PACKAGES);
const wanted = onlyArg ? onlyArg.split(",") : [...PACKAGES];
const unknown = wanted.filter((n) => !known.has(n));
if (unknown.length) {
  console.error(`Not a package: ${unknown.join(", ")} (known: ${PACKAGES.join(", ")})`);
  process.exit(1);
}

execFileSync("bun", ["run", "build:packages"], { cwd: ROOT, stdio: "inherit" });

const made: string[] = [];
for (const name of wanted as PackageName[]) {
  const tarball = packTo(name, dest);
  if (!lintTarball(name, tarball)) {
    console.error(`\n@command-kernel/${name}: the packed tarball fails the package lint`);
    process.exit(1);
  }
  made.push(tarball);
}
console.log(`\nPacked and linted:\n${made.map((t) => `  ${t}`).join("\n")}`);
