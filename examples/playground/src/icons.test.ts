import { expect, it } from "bun:test";
import { Glob } from "bun";
import * as Lucide from "lucide-react";
import { DEMO_ICONS } from "./icon-set";

/**
 * The palette draws only registered icons (icons.ts registers DEMO_ICONS); a name
 * nobody registered becomes a plain circle on screen. So every lucide name written
 * anywhere in the demo's source must be in icon-set.ts. Reads the source as text,
 * because the names live in command data. Never imports the palette package: loading
 * it before a DOM exists breaks the mounted palette tests that run after this file.
 */
it("every icon name the demo uses is registered", async () => {
  const lucide = new Set(Object.keys(Lucide));
  const used = new Set<string>();
  for await (const file of new Glob("**/*.{ts,tsx}").scan(import.meta.dir)) {
    if (file.includes(".test.") || file === "icon-set.ts") continue;
    const text = await Bun.file(`${import.meta.dir}/${file}`).text();
    for (const m of text.matchAll(/["'`]([A-Z][A-Za-z0-9]+)["'`]/g)) {
      const name = m[1];
      if (name && name !== "Icon" && lucide.has(name)) used.add(name);
    }
  }
  expect(used.size).toBeGreaterThan(20);
  expect([...used].filter((n) => !Object.hasOwn(DEMO_ICONS, n))).toEqual([]);
});
