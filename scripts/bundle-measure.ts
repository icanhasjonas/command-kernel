import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * What a consumer pays for an import: `code` bundled minified for the browser, with
 * react / react-dom external (they are peer deps, already in the host app). Everything
 * else the import drags in IS bundled, because that IS the cost. Used by the bundle
 * report and by the budget test, so both measure the same thing.
 */

const ROOT = resolve(import.meta.dir, "..");
// The playground is the one workspace that depends on every package, so
// `@command-kernel/*` resolves from there (the root has no such dep).
const ENTRY_DIR = resolve(ROOT, "examples/playground");

const EXTERNAL = ["react", "react-dom", "react/jsx-runtime", "react-dom/client"];

export async function measureImport(code: string): Promise<{ min: number; gzip: number }> {
  // A real file inside the repo so workspace deps (@command-kernel/*) resolve.
  const entry = resolve(ENTRY_DIR, `.bundle-entry-${Math.random().toString(36).slice(2)}.tsx`);
  writeFileSync(entry, code);
  try {
    const result = await Bun.build({
      entrypoints: [entry],
      external: EXTERNAL,
      minify: true,
      target: "browser",
      format: "esm",
    });
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error("bundle failed");
    }
    const bytes = await result.outputs[0]?.arrayBuffer();
    if (!bytes) throw new Error("bundle produced no output");
    return { min: bytes.byteLength, gzip: gzipSync(Buffer.from(bytes)).byteLength };
  } finally {
    unlinkSync(entry);
  }
}

// `bun scripts/bundle-measure.ts '<code>'` prints {min, gzip} as JSON. The budget test
// measures through this: Bun.build inside `bun test` cannot resolve a workspace
// package's own dependencies under the isolated linker, a plain `bun` process can.
if (import.meta.main) {
  const code = process.argv[2];
  if (!code) throw new Error("usage: bun scripts/bundle-measure.ts '<module code>'");
  console.log(JSON.stringify(await measureImport(code)));
}
