import { expect, it } from "bun:test";
import { resolve } from "node:path";

/**
 * What an app pays to render the palette. It was 267 kB gzipped while `Icon` looked
 * names up in all of lucide (~700 kB of icons, every one shipped); with registered
 * icons it is under 80. The budget leaves room to grow, not room to regress that far.
 * Measured in a child process (see bundle-measure.ts for why).
 */
it("import { CommandPalette } stays under 100 kB gzipped", () => {
  const script = resolve(import.meta.dir, "../scripts/bundle-measure.ts");
  const run = Bun.spawnSync([
    process.execPath,
    script,
    'export { CommandPalette } from "@command-kernel/ui";',
  ]);
  expect(run.stderr.toString()).toBe("");
  const { gzip } = JSON.parse(run.stdout.toString()) as { gzip: number };
  expect(gzip).toBeLessThan(100 * 1024);
}, 30_000);
