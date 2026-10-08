import { expect, test } from "bun:test";

/**
 * The header is `sticky`, and a sticky element only sticks inside its parent. With
 * `#root { height: 100% }` the parent was one viewport tall while the page ran on past
 * it, so the header (role switcher included) scrolled away after the first screen. The
 * page shell may set a floor on its height, never a ceiling.
 */
test("the page shell grows with the page, so the sticky header stays", async () => {
  const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
  const shell = css.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(shell).toContain("min-height: 100%");
  expect(shell).not.toMatch(/(^|[^-])height:/);
});
