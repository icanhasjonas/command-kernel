import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { command } from "./command.js";
import { CommandError, isCommandError } from "./errors.js";
import type { GatePolicy } from "./gate.js";
import { executeNode } from "./kernel.js";
import { signingArgs } from "./signing.js";
import { confirm, ctx, deps, setSeen } from "./typed-args.fixtures.test-util.js";
import type { CommandNode } from "./types.js";

/** Typed args at run time: what run() and the gate receive, and what never runs. */

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
    const out = await executeNode(
      node,
      { thread: "t1", seen: "false", limit: "3" },
      ctx,
      deps(gate),
    );
    expect(out.result).toEqual({ kind: "data", message: "ok", payload: { seq: 9 } });
    expect(seen.ran).toEqual({ thread: "t1", seen: false, limit: 3 });
    expect(seen.gated).toEqual({ thread: "t1", seen: false, limit: 3 });
  });

  it("an invalid typed value never reaches run(); an empty optional one does not block it", async () => {
    let runs = 0;
    const node: CommandNode = {
      ...setSeen,
      run: async () => {
        runs++;
        return { kind: "noop", message: "" };
      },
    };
    const bad = await executeNode(node, { thread: "t1", seen: "maybe" }, ctx, deps());
    expect(bad.argErrors[0]?.argId).toBe("seen");
    expect(runs).toBe(0);
    const blank = await executeNode(node, { thread: "t1", seen: "no", limit: "" }, ctx, deps());
    expect(blank.argErrors).toEqual([]);
    expect(runs).toBe(1);
  });

  it("resolve() on an intermediate hop sees typed args", async () => {
    const seen: ArgValues[] = [];
    const parent: CommandNode = {
      id: "page",
      title: "Page",
      args: [{ id: "n", label: "n", kind: "number" }],
      resolve: async (args) => {
        seen.push(args);
        return [];
      },
    };
    await command([parent], { path: [{ id: "page", args: { n: "3" } }] }, ctx, deps());
    expect(seen).toEqual([{ n: 3 }]);
  });

  it("a gate response hands back the coerced args, and grantFor's form verifies", async () => {
    const d = deps(confirm);
    const node: CommandNode = {
      ...setSeen,
      gate: { confirm: true },
      run: async () => ({ kind: "noop", message: "" }),
    };
    const path = [{ id: node.id, args: { thread: "t1", seen: "1" } }];
    const first = await command([node], { path, execute: true }, ctx, d);
    if (first.kind !== "gate") throw new Error(`expected gate, got ${first.kind}`);
    expect(first.args).toEqual({ thread: "t1", seen: true });
    // what kernel.grantFor does: sign the canonical form of the effective args
    const evidence = d.evidence.sign(node.id, signingArgs(node, first.args), first.priorKey);
    const second = await command(
      [node],
      { path: [{ id: node.id, args: path[0]?.args ?? {}, evidence }], execute: true },
      ctx,
      d,
    );
    expect(second.kind).toBe("result");
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
