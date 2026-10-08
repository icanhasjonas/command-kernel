/**
 * The one place that knows what a published package IS, shared by pack.ts, lint-pkg.ts
 * and publish.ts so the three can never disagree about it.
 *
 * The dev `exports` point at `./src/*.ts` so the monorepo + examples consume the
 * TypeScript source directly (no build in the dev loop). What SHIPS is the
 * `publishConfig.exports` shape, pointing at `./dist`, with `workspace:*` replaced by the
 * monorepo version. Neither `npm pack` nor `bun pm pack` applies `publishConfig.exports`,
 * so the manifest is rewritten in place for the pack and restored after it.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");

/** Every publishable package, in dependency order (core first). */
export const PACKAGES = ["core", "agent", "ui", "wire", "react"] as const;
export type PackageName = (typeof PACKAGES)[number];

export const version = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"))
  .version as string;

export const packageDir = (name: PackageName) => resolve(ROOT, "packages", name);

/** Rewrite a package's manifest to its published shape; returns the function that restores it. */
export function toPublishShape(name: PackageName): () => void {
  const pkgPath = resolve(packageDir(name), "package.json");
  const original = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(original);
  pkg.version = version;
  for (const key of ["dependencies", "peerDependencies", "devDependencies"] as const) {
    const deps = pkg[key];
    if (!deps) continue;
    for (const [dep, ver] of Object.entries(deps)) {
      if (ver === "workspace:*") deps[dep] = version;
    }
  }
  if (pkg.publishConfig?.exports) {
    pkg.exports = pkg.publishConfig.exports;
    delete pkg.publishConfig;
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return () => writeFileSync(pkgPath, original);
}

/** Pack one built package, in its published shape, into `dest`; returns the tarball's path. */
export function packTo(name: PackageName, dest: string): string {
  const scratch = mkdtempSync(join(tmpdir(), `ck-pack-${name}-`));
  const restore = toPublishShape(name);
  try {
    execFileSync("bun", ["pm", "pack", "--destination", scratch, "--quiet"], {
      cwd: packageDir(name),
      stdio: ["ignore", "ignore", "inherit"],
    });
    const [made, ...more] = readdirSync(scratch).filter((f) => f.endsWith(".tgz"));
    if (!made || more.length) throw new Error(`bun pm pack made ${more.length + (made ? 1 : 0)} tarballs for ${name}`);
    mkdirSync(dest, { recursive: true });
    const out = resolve(dest, made);
    copyFileSync(join(scratch, made), out); // a rename fails across volumes
    return out;
  } finally {
    restore();
    rmSync(scratch, { recursive: true, force: true });
  }
}

function run(args: string[]): boolean {
  try {
    execFileSync("bun", args, { cwd: ROOT, stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

/**
 * publint + attw on a packed tarball: the artifact a consumer installs, not the dev shape.
 * `--profile esm-only` ignores the CJS resolutions (these packages are ESM-only). ui's
 * `./theme.css` is excluded: attw only understands JS/types entrypoints, so a CSS subpath
 * is a false "NoResolution"; it resolves fine in a bundler, the only place it runs.
 */
export function lintTarball(name: PackageName, tarball: string): boolean {
  const publintOk = run(["x", "publint", "run", tarball, "--pack", "false"]);
  const attw = ["x", "attw", tarball, "--profile", "esm-only"];
  if (name === "ui") attw.push("--exclude-entrypoints", "./theme.css");
  return run(attw) && publintOk;
}
