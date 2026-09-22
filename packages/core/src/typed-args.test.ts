import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { missingArgs } from "./kernel.js";
import { toJsonSchema, validateArgs } from "./schema.js";
import { cursors, setSeen } from "./typed-args.fixtures.test-util.js";
import type { CommandNode } from "./types.js";

/**
 * Typed args: `number`, `boolean` and `json` kinds, for drivers that carry real JSON
 * (a network RPC) as well as drivers that only ever see text (the palette, a URL).
 * This file: the schema they emit, how text is coerced, how values are validated.
 */

describe("toJsonSchema with typed kinds", () => {
  it("emits number, boolean, arrays of numbers and the declared json schema", () => {
    const schema = toJsonSchema(setSeen);
    expect(schema.properties.seen).toEqual({ type: "boolean" });
    expect(schema.properties.limit).toEqual({ type: "number" });
    expect(schema.properties.ids).toEqual({ type: "array", items: { type: "number" } });
    expect(schema.properties.cursor).toEqual(cursors);
    expect(schema.required).toEqual(["thread", "seen"]);
  });

  it("a json arg with no schema is an open object; a schema keeps the arg's label", () => {
    const node: CommandNode = {
      id: "x",
      title: "x",
      args: [
        { id: "p", label: "p", kind: "json" },
        { id: "c", label: "cursor per box", kind: "json", schema: { type: "object" } },
      ],
    };
    expect(toJsonSchema(node).properties.p).toEqual({ type: "object" });
    expect(toJsonSchema(node).properties.c).toEqual({
      type: "object",
      description: "cursor per box",
    });
  });
});

describe("coerceArgs: text from a palette or a URL becomes the declared type", () => {
  it("parses numbers, booleans, number lists and json", () => {
    const out = coerceArgs(setSeen, {
      thread: "t1",
      seen: "true",
      limit: "25",
      ids: ["1", "2"],
      cursor: '{"box":"b","seq":4}',
    });
    expect(out).toEqual({
      thread: "t1",
      seen: true,
      limit: 25,
      ids: [1, 2],
      cursor: { box: "b", seq: 4 },
    });
  });

  it("accepts 1/0, yes/no, on/off for booleans", () => {
    expect(coerceArgs(setSeen, { seen: "0" }).seen).toBe(false);
    expect(coerceArgs(setSeen, { seen: "yes" }).seen).toBe(true);
    expect(coerceArgs(setSeen, { seen: "on" }).seen).toBe(true);
  });

  it("leaves unparseable text alone so validation can name it", () => {
    const out = coerceArgs(setSeen, { limit: "lots", seen: "maybe", cursor: "{nope" });
    expect(out).toEqual({ limit: "lots", seen: "maybe", cursor: "{nope" });
  });

  it("only plain decimal text is a number: 0x10, 1,5 and Infinity stay text", () => {
    for (const text of ["0x10", "1,5", "Infinity"])
      expect(coerceArgs(setSeen, { limit: text }).limit).toBe(text);
    expect(coerceArgs(setSeen, { limit: "-1.5e3" }).limit).toBe(-1500);
  });

  it("blank text on a typed arg is no value, as it is for text", () => {
    expect(coerceArgs(setSeen, { thread: "t", limit: "  ", seen: "" })).toEqual({ thread: "t" });
  });

  it("is a no-op on values that already have their type, and never mutates", () => {
    const input: ArgValues = { thread: "t1", seen: false, limit: 3, cursor: { box: "b", seq: 1 } };
    const copy = structuredClone(input);
    expect(coerceArgs(setSeen, input)).toEqual(copy);
    expect(input).toEqual(copy);
  });

  it("never touches string kinds, even when the text looks numeric", () => {
    expect(coerceArgs(setSeen, { thread: "42" }).thread).toBe("42");
  });
});

describe("validateArgs with typed kinds", () => {
  it("names a value that is not the declared type", () => {
    const errors = validateArgs(setSeen, { thread: 7, seen: "maybe", limit: Number.NaN });
    expect(errors.map((e) => e.argId).sort()).toEqual(["limit", "seen", "thread"]);
  });

  it("checks json values against the declared schema, with a path in the message", () => {
    expect(validateArgs(setSeen, { cursor: { box: "b" } })).toEqual([
      { argId: "cursor", message: "cursor.seq is required" },
    ]);
    expect(validateArgs(setSeen, { cursor: { box: "b", seq: 1.5 } })[0]?.message).toBe(
      "cursor.seq must be an integer",
    );
    expect(validateArgs(setSeen, { cursor: { box: "b", seq: 1, extra: true } })[0]?.message).toBe(
      "cursor.extra is not allowed",
    );
  });

  it("accepts well-typed values", () => {
    const ok = { thread: "t", seen: true, limit: 2, ids: [1], cursor: { box: "b", seq: 0 } };
    expect(validateArgs(setSeen, ok)).toEqual([]);
  });

  it("presence is by kind: false, 0 and an empty JSON list are values", () => {
    const node: CommandNode = {
      id: "p",
      title: "p",
      args: [
        { id: "on", label: "on", kind: "boolean", required: true },
        { id: "n", label: "n", kind: "number", required: true },
        { id: "l", label: "l", kind: "json", required: true, schema: { type: "array" } },
      ],
    };
    expect(missingArgs(node, { on: false, n: 0, l: [] })).toEqual([]);
    expect(missingArgs(node, {})).toEqual(["on", "n", "l"]);
  });
});
