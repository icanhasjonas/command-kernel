import { describe, expect, it } from "bun:test";
import { commandManifest, renderCommandDocs } from "./docs.js";
import { boxChanged, specs } from "./fixtures.test-util.js";
import { fillRoute, matchRoute, queryArgs } from "./route.js";

describe("routes", () => {
  it("match reads decoded params, and only an exact shape matches", () => {
    expect(matchRoute("/boxes/:b/messages/:m", "/boxes/b%201/messages/m1")).toEqual({
      b: "b 1",
      m: "m1",
    });
    expect(matchRoute("/boxes/:b", "/boxes/b1/extra")).toBeNull();
    expect(matchRoute("/boxes/:b", "/boxes/%E0%A4%A")).toBeNull();
  });

  it("fill encodes params and puts the rest in the query", () => {
    expect(
      fillRoute("/boxes/:b/messages/:m", { b: "a/b", m: "m1", raw: true, tags: ["x", "y"] }),
    ).toBe("/boxes/a%2Fb/messages/m1?raw=true&tags=x&tags=y");
    expect(() => fillRoute("/boxes/:b", {})).toThrow("missing :b");
  });

  it("a __proto__ query param is an own arg, never the prototype", () => {
    const args = queryArgs(new URLSearchParams("__proto__=a&__proto__=b&x=1"));
    expect(Object.hasOwn(args, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(args)).toBe(Object.prototype);
    expect(Object.keys(args)).toEqual(["__proto__", "x"]);
  });
});

describe("reference docs", () => {
  it("the manifest is sorted, typed and complete", () => {
    const m = commandManifest(specs, [boxChanged]);
    expect(m.commands.map((c) => c.id)).toEqual([
      "boom",
      "message.get",
      "thread.list",
      "thread.setSeen",
    ]);
    const seen = m.commands.find((c) => c.id === "thread.setSeen");
    expect(seen?.args.properties.seen).toEqual({ type: "boolean" });
    expect(m.commands.find((c) => c.id === "message.get")?.errors).toEqual(["notFound"]);
    expect(m.events).toEqual([{ name: "box.changed", summary: "a box changed" }]);
  });

  it("renders deterministic Markdown with every command, arg and event", () => {
    const md = renderCommandDocs("Test API", specs, [boxChanged]);
    expect(md).toBe(renderCommandDocs("Test API", [...specs].reverse(), [boxChanged]));
    expect(md).toContain("### `message.get`");
    expect(md).toContain("`GET /boxes/:boxId/messages/:messageId` (cacheable forever)");
    expect(md).toContain("| `limit` | number | no | page size |");
    expect(md).toContain("| `box.changed` | a box changed |");
    expect(md.endsWith("\n")).toBe(true);
  });
});
