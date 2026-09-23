import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The keyboard's layer laws are written in docs/keyboard.md and proven by `describe("L<n> ...")`
 * blocks in two test files. This keeps the two in step: a law the doc states with no test behind
 * it, or a tested law the doc never states, fails the build.
 */

const ROOT = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const TESTS = [
  "packages/core/src/keyboard-laws-order.test.ts",
  "packages/core/src/keyboard-laws-keys.test.ts",
  "packages/core/src/keyboard-laws-scopes.test.ts",
  "packages/react/src/keyboard-react.test.tsx",
];

/** `- **L3** ...` bullets under "### The laws" */
const documented = [...read("docs/keyboard.md").matchAll(/^- \*\*(L\d+)\*\* /gm)].map((m) => m[1]);
/** each `describe("L3 ...` block: its law, and its text up to the next top-level describe */
const blocks = TESTS.flatMap((f) => {
  const text = read(f);
  const tops = [...text.matchAll(/^describe\(/gm)].map((m) => m.index ?? 0);
  return [...text.matchAll(/^describe\("(L\d+) /gm)].map((m) => {
    const start = m.index ?? 0;
    // the block ends at the next top-level describe of ANY kind, so a neighbour cannot lend it tests
    const end = tops.find((t) => t > start) ?? text.length;
    return { law: m[1], body: text.slice(start, end) };
  });
});
const tested = blocks.map((b) => b.law);

describe("docs/keyboard.md and the layer-law tests agree", () => {
  it("states the laws in order, L1 to Ln, none skipped", () => {
    expect(documented.length).toBeGreaterThan(0);
    expect(documented).toEqual(documented.map((_, i) => `L${i + 1}`));
  });

  it("every law in the doc has a test", () => {
    expect(documented.filter((l) => !tested.includes(l))).toEqual([]);
  });

  it("every law block holds a test with an assertion", () => {
    const empty = blocks.filter((b) => !/\bit\(/.test(b.body) || !/expect\(/.test(b.body));
    expect(empty.map((b) => b.law)).toEqual([]);
  });

  it("every tested law is in the doc", () => {
    expect([...new Set(tested)].filter((l) => !documented.includes(l))).toEqual([]);
  });
});
