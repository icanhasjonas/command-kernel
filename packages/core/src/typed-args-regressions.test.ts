import { describe, expect, it } from "bun:test";
import { coerceArgs } from "./coerce.js";
import { command } from "./command.js";
import { parseDeeplink, serializePath } from "./deeplink.js";
import { createMemoryEvidenceStore } from "./evidence.js";
import type { GatePolicy } from "./gate.js";
import { executeNode } from "./kernel.js";
import { createMemoryPolicyStore } from "./policy.js";
import { rank } from "./rank.js";
import { toJsonSchema, validateArgs } from "./schema.js";
import { signingArgs } from "./signing.js";
import type { ArgValues, CommandNode, Ctx } from "./types.js";

/** One regression per defect found in review of the typed-args change (B1..B9). */

const ctx: Ctx = {
  location: { module: "test" },
  user: { id: "u", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};
const confirmGate: GatePolicy = () => ({ allowed: true, needsConfirm: true, checks: [] });
const deps = () => ({
  gate: confirmGate,
  policy: createMemoryPolicyStore(),
  evidence: createMemoryEvidenceStore(),
  ranker: rank,
});
const noop = async () => ({ kind: "noop" as const, message: "" });

const counted: CommandNode = {
  id: "items.trim",
  title: "Trim items",
  gate: { confirm: true },
  args: [
    { id: "n", label: "n", kind: "number", required: true },
    { id: "hard", label: "hard", kind: "boolean" },
    {
      id: "order",
      label: "order",
      kind: "json",
      schema: { type: "array", items: { type: "string" } },
    },
  ],
  run: noop,
};

describe("B1: a grant minted over the palette's text verifies the typed act", () => {
  it("signing the text form and running the typed form (and back) both verify", async () => {
    for (const [signed, ran] of [
      [
        { n: "5", hard: "yes" },
        { n: 5, hard: true },
      ],
      [
        { n: 5, hard: true },
        { n: "5", hard: "on" },
      ],
    ] as Array<[ArgValues, ArgValues]>) {
      const d = deps();
      const grant = d.evidence.sign(counted.id, signingArgs(counted, signed), "");
      const out = await executeNode(counted, ran, ctx, d, { grant, priorKey: "" });
      expect(out.awaitingConfirm).toBe(false);
    }
  });
});

describe("B2: grants over json values keep order and type", () => {
  it("a grant for the list [b, a] does not verify [a, b]", async () => {
    const d = deps();
    const grant = d.evidence.sign(
      counted.id,
      signingArgs(counted, { n: 1, order: ["b", "a"] }),
      "",
    );
    const out = await executeNode(counted, { n: 1, order: ["a", "b"] }, ctx, d, {
      grant,
      priorKey: "",
    });
    expect(out.awaitingConfirm).toBe(true);
  });
});

describe("B3: json arrays survive a deeplink and an agent's text", () => {
  const nums: CommandNode = {
    id: "x",
    title: "x",
    args: [
      {
        id: "ids",
        label: "ids",
        kind: "json",
        schema: { type: "array", items: { type: "number" } },
      },
    ],
  };
  for (const ids of [[7], [1, 2]]) {
    it(`round-trips ${JSON.stringify(ids)}`, () => {
      const back = parseDeeplink(serializePath([{ id: "x", args: { ids } }]))[0]?.args ?? {};
      const coerced = coerceArgs(nums, back);
      expect(coerced).toEqual({ ids });
      expect(validateArgs(nums, coerced)).toEqual([]);
    });
  }
  it("round-trips a one-item list of text", () => {
    const back = parseDeeplink(serializePath([{ id: counted.id, args: { order: ["a"] } }]))[0]
      ?.args;
    expect(coerceArgs(counted, back ?? {}).order).toEqual(["a"]);
  });
  it("an agent's stringified elements are coerced by the items schema", () => {
    expect(coerceArgs(nums, { ids: ["1", "2"] })).toEqual({ ids: [1, 2] });
  });
});

describe("B4: inherited property names never reach the prototype", () => {
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
  it("reports instead of throwing", () => {
    expect(() => validateArgs(obj, { p: { constructor: 1, toString: 2 } })).not.toThrow();
    expect(validateArgs(obj, { p: { toString: 1 } }).map((e) => e.message)).toEqual([
      "p.constructor is required",
      "p.toString is not allowed",
    ]);
  });
});

describe("B5: a json arg with a string schema keeps text as text", () => {
  it('"42" and "true" stay strings', () => {
    const s: CommandNode = {
      id: "s",
      title: "s",
      args: [{ id: "v", label: "v", kind: "json", schema: { type: "string" } }],
    };
    expect(coerceArgs(s, { v: "42" }).v).toBe("42");
    expect(validateArgs(s, coerceArgs(s, { v: "true" }))).toEqual([]);
  });
});

describe("B6: every hop of a path is typed and keyed canonically", () => {
  it("resolve() sees typed args, and the prior key is the same for text and typed input", async () => {
    const seen: ArgValues[] = [];
    const leaf: CommandNode = { ...counted, id: "leaf" };
    const parent: CommandNode = {
      id: "page",
      title: "Page",
      args: [{ id: "n", label: "n", kind: "number" }],
      resolve: async (args) => {
        seen.push(args);
        return [leaf];
      },
    };
    const keys: string[] = [];
    for (const n of ["3", 3]) {
      const res = await command(
        [parent],
        {
          path: [
            { id: "page", args: { n } },
            { id: "leaf", args: { n: 1 } },
          ],
          execute: true,
        },
        ctx,
        deps(),
      );
      if (res.kind !== "gate") throw new Error(res.kind);
      keys.push(res.priorKey);
    }
    expect(seen).toEqual([{ n: 3 }, { n: 3 }]);
    expect(keys[0]).toBe(keys[1] as string);
  });
});

describe("B7: a json arg with a schema keeps its label for the agent", () => {
  it("adds the label when the schema has no description", () => {
    const node: CommandNode = {
      id: "d",
      title: "d",
      args: [{ id: "c", label: "cursor per box", kind: "json", schema: { type: "object" } }],
    };
    expect(toJsonSchema(node).properties.c).toEqual({
      type: "object",
      description: "cursor per box",
    });
  });
});

describe("B9: only plain decimal text becomes a number", () => {
  it("0x10, empty and words stay text and fail validation", () => {
    for (const text of ["0x10", "  ", "1,5", "Infinity"]) {
      const coerced = coerceArgs(counted, { n: text });
      expect(coerced.n).toBe(text);
      expect(validateArgs(counted, coerced)[0]?.argId).toBe("n");
    }
    expect(coerceArgs(counted, { n: "-1.5e3" }).n).toBe(-1500);
  });
});
