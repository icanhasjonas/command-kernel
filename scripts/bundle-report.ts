#!/usr/bin/env bun
/**
 * Bundle report -- what a consumer actually pays for a named import.
 *
 *   bun scripts/bundle-report.ts        # or: bun run report:bundle
 *
 * We bundle a realistic consumer entry (a single named import) minified, with
 * react / react-dom externalised (they are peer deps -- already in the host app).
 * Everything else the driver drags in (radix, framer-motion, lucide, clsx,
 * tailwind-merge, plus @command-kernel/core) IS bundled, because that IS the cost.
 * Reports raw-minified and gzipped bytes for each entry.
 */
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dir, "..");
// The playground is the one workspace that depends on all three packages, so
// `@command-kernel/*` resolves from here (root has no such dep).
const ENTRY_DIR = resolve(ROOT, "examples/playground");

const EXTERNAL = ["react", "react-dom", "react/jsx-runtime", "react-dom/client"];

const ENTRIES = [
  {
    label: 'import { CommandPalette } from "@command-kernel/ui"',
    code: 'export { CommandPalette } from "@command-kernel/ui";',
  },
  {
    label: 'import { createKernel } from "@command-kernel/core"',
    code: 'export { createKernel } from "@command-kernel/core";',
  },
];

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

async function measure(code: string): Promise<{ min: number; gzip: number }> {
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
    const bytes = await result.outputs[0]!.arrayBuffer();
    const min = bytes.byteLength;
    const gzip = gzipSync(Buffer.from(bytes)).byteLength;
    return { min, gzip };
  } finally {
    unlinkSync(entry);
  }
}

console.log("Bundle report (minified; react/react-dom external)\n");
const rows: string[] = [];
for (const { label, code } of ENTRIES) {
  const { min, gzip } = await measure(code);
  rows.push(`  ${label}\n    minified: ${kb(min)}   gzipped: ${kb(gzip)}`);
}
console.log(rows.join("\n\n"));
