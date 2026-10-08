#!/usr/bin/env bun
/**
 * Bundle report -- what a consumer actually pays for a named import.
 *
 *   bun scripts/bundle-report.ts        # or: bun run report:bundle
 *
 * Each entry is a realistic consumer import, measured by `measureImport`
 * (bundle-measure.ts): minified, react / react-dom external, everything else in.
 * `test/bundle-budget.test.ts` holds the palette to a budget with the same measure.
 */
import { measureImport } from "./bundle-measure";

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

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

console.log("Bundle report (minified; react/react-dom external)\n");
const rows: string[] = [];
for (const { label, code } of ENTRIES) {
  const { min, gzip } = await measureImport(code);
  rows.push(`  ${label}\n    minified: ${kb(min)}   gzipped: ${kb(gzip)}`);
}
console.log(rows.join("\n\n"));
