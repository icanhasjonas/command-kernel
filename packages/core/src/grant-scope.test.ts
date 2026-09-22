import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { createKernel } from "./create-kernel.js";
import { pathKey } from "./evidence.js";
import { executeNode } from "./kernel.js";
import { signingArgs } from "./signing.js";
import { confirm, ctx, deps } from "./typed-args.fixtures.test-util.js";
import type { CommandNode, Ctx } from "./types.js";

/** What a grant is bound to (review round 5 core, round 3 wire). */

const plain: CommandNode = {
  id: "p",
  title: "p",
  gate: { confirm: true },
  run: async () => ({ kind: "noop", message: "" }),
};

const verifies = async (node: CommandNode, signed: ArgValues, ran: ArgValues) => {
  const d = deps(confirm);
  const grant = d.evidence.sign(node.id, signingArgs(node, signed), "");
  const out = await executeNode(node, ran, ctx, d, { grant, priorKey: "" });
  return !out.awaitingConfirm;
};

describe("K1-D2/D3: an undeclared arg's key encodes arity", () => {
  it('"prod", ["prod"], "", [] and [""] all key differently', () => {
    const values: ArgValues["x"][] = ["prod", ["prod"], "", [], [""]];
    const keys = values.map((x) => pathKey([{ id: "a", args: { x } }]));
    expect(new Set(keys).size).toBe(values.length);
  });

  it("text that looks like a list keys apart from the list", () => {
    const key = (x: ArgValues["x"]) => pathKey([{ id: "a", args: { x } }]);
    expect(key("[1]prod")).not.toBe(key(["prod"]));
    expect(key(["a,b"])).not.toBe(key(["a", "b"]));
  });

  it("a grant for {targets: 'prod'} does not verify {targets: ['prod']}", async () => {
    expect(await verifies(plain, { targets: "prod" }, { targets: ["prod"] })).toBe(false);
    expect(await verifies(plain, { targets: [] }, { targets: [""] })).toBe(false);
    expect(await verifies(plain, { targets: ["b", "a"] }, { targets: ["a", "b"] })).toBe(true);
  });
});

describe("K1-D6: a multiple json arg is signed in order", () => {
  const rows: CommandNode = {
    ...plain,
    args: [{ id: "r", label: "r", kind: "json", multiple: true, schema: { type: "number" } }],
  };

  it("the same list verifies, a reordered one does not", async () => {
    expect(await verifies(rows, { r: [1, 2] }, { r: [1, 2] })).toBe(true);
    expect(await verifies(rows, { r: [1, 2] }, { r: [2, 1] })).toBe(false);
  });

  it("a multiple text arg is still a set", async () => {
    const tags: CommandNode = {
      ...plain,
      args: [{ id: "t", label: "t", kind: "string", multiple: true }],
    };
    expect(await verifies(tags, { t: ["a", "b"] }, { t: ["b", "a"] })).toBe(true);
  });
});

const as = (id: string): Ctx => ({ ...ctx, user: { ...ctx.user, id } });

describe("K2-D2: a grant is bound to the principal it was minted for", () => {
  const danger: CommandNode = {
    ...plain,
    id: "danger",
    args: [{ id: "n", label: "n", kind: "number" }],
  };
  const ask = (
    k: ReturnType<typeof createKernel>,
    who: Ctx,
    evidence?: { nonce: string; sig: string },
  ) =>
    k.command(
      { path: [{ id: "danger", args: { n: 2 }, ...(evidence && { evidence }) }], execute: true },
      who,
    );

  it("u1's grant runs for u1 and not for u2 (default principal: ctx.user.id)", async () => {
    const k = createKernel({ roots: [danger] });
    const gate = await ask(k, as("u1"));
    if (gate.kind !== "gate") throw new Error(gate.kind);
    const grant = k.grantFor(gate);
    expect((await ask(k, as("u2"), grant)).kind).toBe("gate");
    expect((await ask(k, as("u1"), grant)).kind).toBe("result");
  });

  it("principalOf decides what a principal is", async () => {
    const k = createKernel({ roots: [danger], principalOf: (c) => c.user.brand });
    const gate = await ask(k, as("u1"));
    if (gate.kind !== "gate") throw new Error(gate.kind);
    // same brand, another user: the host said the brand is the principal
    expect((await ask(k, as("u2"), k.grantFor(gate))).kind).toBe("result");
  });
});

describe("K2-D1: a dry run evaluates the gate and never runs", () => {
  it("an ungated command answers gate (no confirm owed) without running", async () => {
    let ran = 0;
    const free: CommandNode = {
      id: "free",
      title: "Free",
      run: async () => {
        ran++;
        return { kind: "noop", message: "" };
      },
    };
    const k = createKernel({ roots: [free, plain] });
    const res = await k.command({ path: [{ id: "free" }], execute: true, dryRun: true }, ctx);
    expect(res.kind).toBe("gate");
    if (res.kind === "gate") expect(res.verdict.needsConfirm).toBe(false);
    expect(ran).toBe(0);
    const gated = await k.command({ path: [{ id: "p" }], execute: true, dryRun: true }, ctx);
    expect(gated.kind === "gate" && gated.verdict.needsConfirm).toBe(true);
  });
});
