import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { coerceArgs } from "./coerce.js";
import { createKernel } from "./create-kernel.js";
import { createMemoryPolicyStore, ruleForNode } from "./policy.js";
import { signingArgs } from "./signing.js";
import type { CommandNode, Ctx } from "./types.js";

/** Review round 6: B3, B4, B5, B6 and N1, each with the input that proved it. */

const ctx: Ctx = {
  location: { module: "m" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

/** A confirm-gated node whose run() records the args it was handed. */
function gated(args: CommandNode["args"]) {
  const seen: ArgValues[] = [];
  const node: CommandNode = {
    id: "act",
    title: "Act",
    gate: { confirm: true },
    ...(args !== undefined && { args }),
    run: async (a) => {
      seen.push(a);
      return { kind: "noop", message: "" };
    },
  };
  const k = createKernel({ roots: [node] });
  const exec = (args: ArgValues, evidence?: Parameters<typeof k.grantFor>[0]) =>
    k.command(
      {
        path: [{ id: "act", args, ...(evidence && { evidence: k.grantFor(evidence) }) }],
        execute: true,
      },
      ctx,
    );
  return { node, k, seen, exec };
}

/** An in-process caller can hand over values JSON cannot: undefined, NaN, a function. */
const raw = (v: Record<string, unknown>) => v as unknown as ArgValues;

describe("B3: a list for a single-value text arg is invalid", () => {
  it("to: [a, b] on a non-multiple email arg never reaches the gate", async () => {
    const { exec } = gated([{ id: "to", label: "To", kind: "email", required: true }]);
    const res = await exec({ to: ["a@b.io", "c@d.io"] });
    expect(res.kind).toBe("args");
    if (res.kind === "args") expect(res.errors.map((e) => e.argId)).toEqual(["to"]);
  });
});

describe("B4: an undefined value is no value", () => {
  const spec: CommandNode["args"] = [{ id: "note", label: "Note", kind: "string" }];

  it("coerceArgs drops undefined keys, declared or not", () => {
    const { node } = gated(spec);
    const out = coerceArgs(node, raw({ note: undefined, extra: undefined, keep: "x" }));
    expect(Object.keys(out)).toEqual(["keep"]);
    expect(Object.keys(signingArgs(node, raw({ note: undefined })))).toEqual([]);
  });

  it("a grant for {note: undefined} does not verify {note: ''}", async () => {
    const { exec } = gated(spec);
    const gate = await exec(raw({ note: undefined }));
    if (gate.kind !== "gate") throw new Error(gate.kind);
    expect((await exec({ note: "" }, gate)).kind).toBe("gate");
  });

  it("run() never sees the undefined key", async () => {
    const { exec, seen } = gated(spec);
    const gate = await exec(raw({ note: undefined }));
    if (gate.kind !== "gate") throw new Error(gate.kind);
    expect((await exec(raw({ note: undefined }), gate)).kind).toBe("result");
    expect(seen.map((a) => Object.hasOwn(a, "note"))).toEqual([false]);
  });
});

describe("B5: a json arg holding what JSON cannot carry is invalid", () => {
  const spec: CommandNode["args"] = [{ id: "cfg", label: "cfg", kind: "json" }];
  const bad: Array<[string, unknown]> = [
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["undefined", undefined],
    ["a function", () => 1],
    ["a symbol", Symbol("s")],
    ["a bigint", 1n],
  ];
  for (const [name, v] of bad) {
    it(`${name} inside an object`, async () => {
      expect((await gated(spec).exec(raw({ cfg: { x: v } }))).kind).toBe("args");
    });
  }
  it("NaN inside a list", async () => {
    expect((await gated(spec).exec(raw({ cfg: { x: [Number.NaN] } }))).kind).toBe("args");
  });
});

describe("B6: an arg named after an Object.prototype member", () => {
  const spec: CommandNode["args"] = [
    { id: "constructor", label: "c", kind: "string", required: true },
    { id: "toString", label: "t", kind: "number" },
  ];

  it("absent is missing, not a TypeError", async () => {
    const res = await gated(spec).exec({});
    expect(res.kind === "args" && res.missing).toEqual(["constructor"]);
  });

  it("an absent optional one is simply absent", async () => {
    const { exec } = gated(spec);
    const gate = await exec({ constructor: "x" });
    expect(gate.kind === "gate" && gate.args).toEqual({ constructor: "x" });
  });

  it("policy reads own keys only", () => {
    const node: CommandNode = {
      id: "p",
      title: "p",
      args: [{ id: "valueOf", label: "v", kind: "email" }],
    };
    expect(ruleForNode(node, {}).scope.kind).toBe("command");
    const policy = createMemoryPolicyStore();
    policy.allow({ commandId: "p", scope: { kind: "prefix", argId: "toString", prefix: "f" } });
    expect(policy.match("p", {})).toBeNull();
  });
});

describe("N1: policy compares json values in canonical form", () => {
  it("a rule for {a, b} matches {b, a}", () => {
    const policy = createMemoryPolicyStore();
    policy.allow({ commandId: "c", scope: { kind: "arg", argId: "cfg", value: '{"a":1,"b":2}' } });
    expect(policy.match("c", { cfg: { b: 2, a: 1 } })).not.toBeNull();
  });
});
