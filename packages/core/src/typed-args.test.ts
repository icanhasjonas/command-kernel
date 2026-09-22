import { describe, expect, it } from "bun:test";
import { coerceArgs } from "./coerce.js";
import { command } from "./command.js";
import { parseDeeplink, serializePath } from "./deeplink.js";
import { CommandError, isCommandError } from "./errors.js";
import { createMemoryEvidenceStore, pathKey } from "./evidence.js";
import type { GatePolicy } from "./gate.js";
import { executeNode } from "./kernel.js";
import { createMemoryPolicyStore } from "./policy.js";
import { rank } from "./rank.js";
import { type JsonSchemaNode, toJsonSchema, validateArgs } from "./schema.js";
import { signingArgs } from "./signing.js";
import type { ArgValues, CommandNode, Ctx } from "./types.js";

/**
 * Typed args: `number`, `boolean` and `json` kinds, for drivers that carry real JSON
 * (a network RPC) as well as drivers that only ever see text (the palette, a URL).
 * String kinds behave exactly as before; that is the compatibility promise.
 */

const ctx: Ctx = {
  location: { module: "test" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

const cursors: JsonSchemaNode = {
  type: "object",
  properties: { box: { type: "string" }, seq: { type: "integer" } },
  required: ["box", "seq"],
  additionalProperties: false,
};

const setSeen: CommandNode = {
  id: "thread.setSeen",
  title: "Mark seen",
  args: [
    { id: "thread", label: "thread", kind: "string", required: true },
    { id: "seen", label: "seen", kind: "boolean", required: true },
    { id: "limit", label: "limit", kind: "number" },
    { id: "ids", label: "ids", kind: "number", multiple: true },
    { id: "cursor", label: "cursor", kind: "json", schema: cursors },
  ],
};

const allow: GatePolicy = () => ({ allowed: true, needsConfirm: false, checks: [] });
const deps = () => ({
  gate: allow,
  policy: createMemoryPolicyStore(),
  evidence: createMemoryEvidenceStore(),
  ranker: rank,
});

describe("toJsonSchema with typed kinds", () => {
  it("emits number, boolean, arrays of numbers and the declared json schema", () => {
    const schema = toJsonSchema(setSeen);
    expect(schema.properties.seen).toEqual({ type: "boolean" });
    expect(schema.properties.limit).toEqual({ type: "number" });
    expect(schema.properties.ids).toEqual({ type: "array", items: { type: "number" } });
    expect(schema.properties.cursor).toEqual(cursors);
    expect(schema.required).toEqual(["thread", "seen"]);
  });

  it("a json arg with no schema is an open object", () => {
    const node: CommandNode = {
      id: "x",
      title: "x",
      args: [{ id: "p", label: "p", kind: "json" }],
    };
    expect(toJsonSchema(node).properties.p).toEqual({ type: "object" });
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

  it("accepts 1/0 and yes/no for booleans", () => {
    expect(coerceArgs(setSeen, { seen: "0" }).seen).toBe(false);
    expect(coerceArgs(setSeen, { seen: "yes" }).seen).toBe(true);
  });

  it("leaves unparseable text alone so validation can name it", () => {
    const out = coerceArgs(setSeen, { limit: "lots", seen: "maybe", cursor: "{nope" });
    expect(out).toEqual({ limit: "lots", seen: "maybe", cursor: "{nope" });
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
    expect(
      validateArgs(setSeen, {
        thread: "t",
        seen: true,
        limit: 2,
        ids: [1],
        cursor: { box: "b", seq: 0 },
      }),
    ).toEqual([]);
  });
});

describe("executeNode and command() run with typed, coerced args", () => {
  it("run() receives numbers and booleans, and the gate sees the same args", async () => {
    const seen: { ran?: ArgValues; gated?: ArgValues | undefined } = {};
    const node: CommandNode = {
      ...setSeen,
      run: async (args) => {
        seen.ran = args;
        return { kind: "data", message: "ok", payload: { seq: 9 } };
      },
    };
    const gate: GatePolicy = (_n, _c, args) => {
      seen.gated = args;
      return { allowed: true, needsConfirm: false, checks: [] };
    };
    const out = await executeNode(node, { thread: "t1", seen: "false", limit: "3" }, ctx, {
      ...deps(),
      gate,
    });
    expect(out.result).toEqual({ kind: "data", message: "ok", payload: { seq: 9 } });
    expect(seen.ran).toEqual({ thread: "t1", seen: false, limit: 3 });
    expect(seen.gated).toEqual({ thread: "t1", seen: false, limit: 3 });
  });

  it("an invalid typed value never reaches run()", async () => {
    let ran = false;
    const node: CommandNode = {
      ...setSeen,
      run: async () => {
        ran = true;
        return { kind: "noop", message: "" };
      },
    };
    const out = await executeNode(node, { thread: "t1", seen: "maybe" }, ctx, deps());
    expect(ran).toBe(false);
    expect(out.argErrors[0]?.argId).toBe("seen");
  });

  it("a gate response hands back the coerced args, so a grant over them verifies", async () => {
    const d = deps();
    const node: CommandNode = {
      ...setSeen,
      gate: { confirm: true },
      run: async () => ({ kind: "noop", message: "" }),
    };
    const confirmGate: GatePolicy = () => ({ allowed: true, needsConfirm: true, checks: [] });
    const path = [{ id: node.id, args: { thread: "t1", seen: "1" } }];
    const first = await command([node], { path, execute: true }, ctx, { ...d, gate: confirmGate });
    if (first.kind !== "gate") throw new Error(`expected gate, got ${first.kind}`);
    expect(first.args).toEqual({ thread: "t1", seen: true });
    // what kernel.grantFor does: sign the canonical form of the effective args
    const evidence = d.evidence.sign(node.id, signingArgs(node, first.args), first.priorKey);
    const second = await command(
      [node],
      { path: [{ ...path[0], id: node.id, evidence }], execute: true },
      ctx,
      { ...d, gate: confirmGate },
    );
    expect(second.kind).toBe("result");
  });
});

describe("evidence and deeplinks stay canonical", () => {
  it("string-only args key exactly as before (existing grants keep verifying)", () => {
    expect(pathKey([{ id: "a", args: { x: "1", y: ["b", "a"] } }])).toBe("a(x=1&y=a,b)");
  });

  it("raw typed values key canonically, and never collide with text", () => {
    const typed = pathKey([{ id: "a", args: { n: 1, o: { b: 1, a: 2 } } }]);
    expect(typed).toBe('a(n=~1&o=~{"a":2,"b":1})');
    const key = (n: string | number) => pathKey([{ id: "a", args: { n } }]);
    expect(key("1")).not.toBe(key(1));
    expect(key("~1")).not.toBe(key(1));
  });

  it("typed args survive a deeplink round trip through coercion", () => {
    const args = { thread: "t1", seen: true, limit: 5, cursor: { box: "b", seq: 2 } };
    const url = serializePath([{ id: setSeen.id, args }]);
    const back = parseDeeplink(url)[0]?.args ?? {};
    expect(coerceArgs(setSeen, back)).toEqual(args);
  });
});

describe("CommandError", () => {
  it("carries a machine code, a message and optional details", () => {
    const err = new CommandError("notFound", "no such thread", { threadId: "t9" });
    expect(err).toBeInstanceOf(Error);
    expect(isCommandError(err)).toBe(true);
    expect(isCommandError(new Error("x"))).toBe(false);
    expect([err.code, err.message, err.details]).toEqual([
      "notFound",
      "no such thread",
      { threadId: "t9" },
    ]);
  });
});
