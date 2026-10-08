import { expect, it } from "bun:test";
import { resolve } from "node:path";
import { ADOPT_SNIPPET } from "./snippet";

const PACKAGES = resolve(import.meta.dir, "../../../../../packages");

/** The names a package's public surface (its src/index.ts) exports, read as text. */
async function exportsOf(pkg: string): Promise<Set<string>> {
  const index = await Bun.file(`${PACKAGES}/${pkg}/src/index.ts`).text();
  const names = [...index.matchAll(/export (?:type )?\{([^}]+)\}/g)].flatMap(([, list = ""]) =>
    list.split(",").map(
      (n) =>
        n
          .replace(/^\s*type\s+/, "")
          .trim()
          .split(/\s+as\s+/)
          .pop() ?? "",
    ),
  );
  return new Set(names.filter(Boolean));
}

/**
 * The page shows this code as what an app writes. Every name it imports from a
 * package must be in that package's public surface, or the page is showing code that
 * does not compile. Read as text: loading the palette package here, before any DOM
 * exists, would break the mounted palette tests that run later in the same process.
 */
it("every name the adoption snippet imports is exported by its package", async () => {
  const imports = [...ADOPT_SNIPPET.matchAll(/import \{([^}]+)\} from "([^"]+)";/g)];
  expect(imports.length).toBe(4);
  for (const [, list = "", from = ""] of imports) {
    const names = list.split(",").map((n) => n.replace(/^\s*type\s+/, "").trim());
    const pkg = from.match(/^@command-kernel\/(.+)$/)?.[1];
    const exported = pkg
      ? await exportsOf(pkg)
      : new Set(Object.keys((await import(from)) as object));
    for (const name of names) expect(exported.has(name), `${name} from ${from}`).toBe(true);
  }
});
