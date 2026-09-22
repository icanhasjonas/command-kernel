import { describe, expect, it } from "bun:test";
import { coerceArgs } from "./coerce.js";
import { parseDeeplink, serializePath } from "./deeplink.js";
import { describeNode } from "./describe.js";
import { missingArgs } from "./kernel.js";
import { validateArgs } from "./schema.js";
import { setSeen, trim } from "./typed-args.fixtures.test-util.js";
import type { CommandNode } from "./types.js";

/** Typed args through a URL (deeplinks), and JSON that a model sent as text. */

const nums: CommandNode = {
  id: "x",
  title: "x",
  args: [
    { id: "ids", label: "ids", kind: "json", schema: { type: "array", items: { type: "number" } } },
  ],
};

const roundTrip = (node: CommandNode, args: Record<string, unknown>, withSpecs = false) => {
  const url = serializePath(
    [{ id: node.id, args: args as never }],
    withSpecs && node.args ? { args: node.args } : {},
  );
  return coerceArgs(node, parseDeeplink(url)[0]?.args ?? {});
};

describe("deeplinks", () => {
  it("typed scalars and a json object round-trip", () => {
    const args = { thread: "t1", seen: true, limit: 5, cursor: { box: "b", seq: 2 } };
    expect(roundTrip(setSeen, args)).toEqual(args);
  });

  for (const ids of [[7], [1, 2]]) {
    it(`a json number list ${JSON.stringify(ids)} round-trips and validates`, () => {
      const back = roundTrip(nums, { ids });
      expect(back).toEqual({ ids });
      expect(validateArgs(nums, back)).toEqual([]);
    });
  }

  it("a one-item text list round-trips", () => {
    expect(roundTrip(trim, { order: ["a"] }).order).toEqual(["a"]);
  });

  it("with the specs, a json list keeps empty strings and text that looks like JSON", () => {
    expect(roundTrip(trim, { order: ["a", "", "b"] }, true).order).toEqual(["a", "", "b"]);
    expect(roundTrip(trim, { order: ["[1]"] }, true).order).toEqual(["[1]"]);
  });
});

describe("json that arrives as text", () => {
  it("a model's stringified elements are coerced by the items schema", () => {
    expect(coerceArgs(nums, { ids: ["1", "2"] })).toEqual({ ids: [1, 2] });
  });

  it("a json arg with a string schema keeps text as text", () => {
    const s: CommandNode = {
      id: "s",
      title: "s",
      args: [{ id: "v", label: "v", kind: "json", schema: { type: "string" } }],
    };
    expect(coerceArgs(s, { v: "42" }).v).toBe("42");
    expect(validateArgs(s, coerceArgs(s, { v: "true" }))).toEqual([]);
  });

  it("inherited property names never reach the prototype", () => {
    const obj: CommandNode = {
      id: "o",
      title: "o",
      args: [
        {
          id: "p",
          label: "p",
          kind: "json",
          schema: {
            type: "object",
            properties: {},
            required: ["constructor"],
            additionalProperties: false,
          },
        },
      ],
    };
    expect(() => validateArgs(obj, { p: { constructor: 1, toString: 2 } })).not.toThrow();
    expect(validateArgs(obj, { p: { toString: 1 } }).map((e) => e.message)).toEqual([
      "p.constructor is required",
      "p.toString is not allowed",
    ]);
  });
});

describe("review round 3", () => {
  const rows: CommandNode = {
    id: "r",
    title: "r",
    args: [
      { id: "rows", label: "rows", kind: "json", multiple: true, schema: { type: "object" } },
      { id: "ids", label: "ids", kind: "number", multiple: true, required: true },
      { id: "name", label: "name", kind: "string" },
    ],
  };

  it("a json + multiple arg sent as texts is parsed per item", () => {
    const back = coerceArgs(rows, { rows: ['{"a":1}', '{"a":2}'], ids: [1] });
    expect(back.rows).toEqual([{ a: 1 }, { a: 2 }]);
    expect(validateArgs(rows, back)).toEqual([]);
  });

  it("blank items in a typed list are dropped; an all-blank list is missing", () => {
    expect(coerceArgs(rows, { ids: ["1", ""] }).ids).toEqual([1]);
    expect(missingArgs(rows, { ids: [] })).toEqual(["ids"]);
    expect(missingArgs(rows, { ids: [""] })).toEqual(["ids"]);
  });

  it("missingArgs on raw blank text agrees with executeNode", () => {
    expect(missingArgs(trim, { n: "" })).toEqual(["n"]);
  });

  it("a number or boolean sent for a text arg is its text", () => {
    expect(coerceArgs(rows, { name: 5, ids: [1] }).name).toBe("5");
  });

  it("describe tells an agent a json arg's schema and that it is a list", () => {
    const arg = describeNode(rows).args.find((a) => a.id === "rows");
    expect([arg?.multiple, arg?.schema]).toEqual([true, { type: "object" }]);
  });
});
