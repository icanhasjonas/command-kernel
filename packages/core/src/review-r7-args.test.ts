import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { createKernel } from "./create-kernel.js";
import { hopArgs, hopsKey } from "./hops-key.js";
import { validateArgs } from "./schema.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * Core review round 7, the arg half: C1 (undeclared args), C2 (-0), C3 (non-plain
 * objects in a json arg), C7 (an empty search keys the same on every driver) and the
 * core half of wire W7 (an empty `multiple` list is no value).
 */

const ctx: Ctx = {
  location: { module: "m" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

let seen: ArgValues | null = null;
const capture = async (a: ArgValues) => {
  seen = a;
  return { kind: "noop" as const, message: "" };
};

const act: CommandNode = {
  id: "act",
  title: "Act",
  gate: { confirm: true },
  args: [{ id: "n", label: "n", kind: "number" }],
  run: capture,
};

const typed: CommandNode = {
  id: "typed",
  title: "Typed",
  args: [
    { id: "n", label: "n", kind: "number" },
    { id: "doc", label: "doc", kind: "json" },
    { id: "list", label: "list", kind: "json", schema: { type: "array" } },
    { id: "tags", label: "tags", kind: "string", multiple: true },
    { id: "ids", label: "ids", kind: "number", multiple: true },
  ],
  run: capture,
};

const exec = (node: CommandNode, args: ArgValues) =>
  createKernel({ roots: [node] }).command({ path: [{ id: node.id, args }], execute: true }, ctx);

describe("C1: an arg the node does not declare is refused", () => {
  it("validateArgs names the undeclared key", () => {
    expect(validateArgs(act, { order: ["keep", "drop"] })).toEqual([
      { argId: "order", message: "order is not an argument of Act" },
    ]);
  });

  it("an undeclared list never reaches the gate, so it cannot be replayed reordered", async () => {
    const res = await exec(act, { n: 1, order: ["keep", "drop"] });
    expect(res.kind).toBe("args");
    expect(res.kind === "args" && res.errors.map((e) => e.argId)).toEqual(["order"]);
  });

  it("C4: an undeclared NaN or null is refused too", async () => {
    for (const bad of [Number.NaN, null]) {
      const res = await exec(act, { n: 1, x: bad as unknown as number });
      expect(res.kind === "args" && res.errors[0]?.argId).toBe("x");
    }
  });

  it("a node with no args refuses any arg", async () => {
    const bare: CommandNode = { id: "bare", title: "Bare", run: capture };
    expect((await exec(bare, { a: "1" })).kind).toBe("args");
    expect((await exec(bare, {})).kind).toBe("result");
  });
});

describe("C2: -0 is 0 before anything signs or runs", () => {
  it("a number arg", async () => {
    expect(Object.is(coerceArgs(typed, { n: -0 }).n, 0)).toBe(true);
    expect(Object.is(coerceArgs(typed, { n: "-0" }).n, 0)).toBe(true);
    await exec(typed, { n: -0, ids: [-0, 2] });
    expect(Object.is(seen?.n, 0)).toBe(true);
    expect(Object.is((seen?.ids as number[] | undefined)?.[0], 0)).toBe(true);
  });

  it("inside a json value, at any depth", async () => {
    await exec(typed, { doc: { a: -0, b: [{ c: -0 }] }, list: [-0] });
    const doc = seen?.doc as { a: number; b: Array<{ c: number }> };
    expect(Object.is(doc.a, 0)).toBe(true);
    expect(Object.is(doc.b[0]?.c, 0)).toBe(true);
    expect(Object.is((seen?.list as number[] | undefined)?.[0], 0)).toBe(true);
  });
});

describe("C3: a json arg holds plain objects only", () => {
  class Point {
    x = 1;
  }
  const odd = { date: new Date(0), map: new Map([["a", 1]]), instance: new Point() };

  for (const [name, v] of Object.entries(odd)) {
    it(`refuses a ${name}, at the top or nested`, async () => {
      for (const doc of [v, { inner: v }]) {
        const res = await exec(typed, { doc: doc as unknown as ArgValues });
        expect(res.kind === "args" && res.errors[0]?.argId).toBe("doc");
      }
    });
  }

  it("accepts a null-prototype object", async () => {
    const bare = Object.assign(Object.create(null) as Record<string, number>, { a: 1 });
    expect((await exec(typed, { doc: bare })).kind).toBe("result");
  });
});

describe("C7: an empty search keys the same in the palette and via command()", () => {
  const child: CommandNode = { id: "act", title: "Act", gate: { confirm: true }, run: capture };
  const search: CommandNode = {
    id: "search",
    title: "Search",
    args: [{ id: "q", label: "query", kind: "string", positional: true }],
    resolve: async () => [child],
  };

  it("hopsKey drops an empty text arg", () => {
    const empty = hopsKey([{ node: search, args: hopArgs(search, { q: "" }, ctx) }]);
    const none = hopsKey([{ node: search, args: hopArgs(search, undefined, ctx) }]);
    expect(empty).toBe(none);
    expect(none).toBe("search()");
  });

  it("command() binds the grant the same with or without q=''", async () => {
    const k = createKernel({ roots: [search] });
    const keyOf = async (args?: ArgValues) => {
      const seg = args ? { id: "search", args } : { id: "search" };
      const res = await k.command({ path: [seg, { id: "act" }], execute: true }, ctx);
      return res.kind === "gate" ? res.priorKey : res.kind;
    };
    expect(await keyOf({ q: "" })).toBe(await keyOf());
  });
});

describe("W7 (core): an empty list for a `multiple` arg is no value", () => {
  it("is dropped by coercion, so run() never sees []", async () => {
    expect(coerceArgs(typed, { tags: [] })).toEqual({});
    expect(coerceArgs(typed, { tags: ["", " "] })).toEqual({});
    await exec(typed, { tags: [] });
    expect(seen && Object.hasOwn(seen, "tags")).toBe(false);
  });
});
