import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { build, type Rollup } from "vite";

/**
 * The ui package's styling contract, from the consumer's side: an app that imports
 * `@command-kernel/ui/theme.css` gets the CSS for every class the palette uses.
 * Tailwind only generates what it scans, and it does not scan a workspace package
 * on its own, so without this the palette rendered with no layout at all: no
 * `fixed`, no width, dropped below the fold.
 */
test("importing the ui theme generates the palette's own classes", async () => {
  const out = (await build({
    root: resolve(import.meta.dir, ".."),
    logLevel: "silent",
    build: { write: false },
  })) as Rollup.RollupOutput;
  const css = out.output
    .filter((f): f is Rollup.OutputAsset => f.type === "asset" && f.fileName.endsWith(".css"))
    .map((f) => String(f.source))
    .join("\n");
  // CommandPalette.tsx: the dialog's position and width
  expect(css).toContain("top:14vh");
  expect(css).toContain("width:min(640px,92vw)");
}, 60_000);
