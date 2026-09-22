import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { command } from "./command.js";
import { pathKey } from "./evidence.js";
import { executeNode } from "./kernel.js";
import { signingArgs } from "./signing.js";
import { confirm, ctx, deps, trim } from "./typed-args.fixtures.test-util.js";
import type { CommandNode } from "./types.js";

/**
 * Grants over typed args: the same act verifies however a driver holds it (the
 * palette's text, the wire's JSON); a different act never does.
 */

const verifies = async (node: CommandNode, signed: ArgValues, ran: ArgValues) => {
  const d = deps(confirm);
  const grant = d.evidence.sign(node.id, signingArgs(node, signed), "");
  const out = await executeNode(node, ran, ctx, d, { grant, priorKey: "" });
  return !out.awaitingConfirm;
};

describe("the same act verifies across representations", () => {
  it("text signed, typed run -- and back", async () => {
    expect(await verifies(trim, { n: "5", hard: "yes" }, { n: 5, hard: true })).toBe(true);
    expect(await verifies(trim, { n: 5, hard: true }, { n: "5", hard: "on" })).toBe(true);
  });

  it("the prior-path key is the same whether a hop's arg came as text or typed", async () => {
    const leaf: CommandNode = { ...trim, id: "leaf" };
    const parent: CommandNode = {
      id: "page",
      title: "Page",
      args: [{ id: "n", label: "n", kind: "number" }],
      resolve: async () => [leaf],
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
        deps(confirm),
      );
      if (res.kind !== "gate") throw new Error(res.kind);
      keys.push(res.priorKey);
    }
    expect(keys[0]).toBe(keys[1] as string);
  });
});

describe("a different act never verifies", () => {
  it("a JSON list in another order", async () => {
    expect(await verifies(trim, { n: 1, order: ["b", "a"] }, { n: 1, order: ["a", "b"] })).toBe(
      false,
    );
  });

  it("an undeclared number against the same-looking text", async () => {
    expect(await verifies(trim, { n: 1, extra: "5" }, { n: 1, extra: 5 })).toBe(false);
    expect(await verifies(trim, { n: 1, extra: 5 }, { n: 1, extra: 5 })).toBe(true);
  });
});

describe("keys", () => {
  it("text-only args key exactly as before", () => {
    expect(pathKey([{ id: "a", args: { x: "1", y: ["b", "a"] } }])).toBe("a(x=1&y=a,b)");
  });

  it("raw typed values carry a mark text cannot forge", () => {
    const key = (n: string | number) => pathKey([{ id: "a", args: { n } }]);
    expect(key(1)).toBe("a(n=1)");
    expect(key("1")).not.toBe(key(1));
    expect(key("1")).not.toBe(key(1));
    expect(pathKey([{ id: "a", args: { o: { b: 1, a: 2 } } }])).toBe('a(o={"a":2,"b":1})');
  });
});
