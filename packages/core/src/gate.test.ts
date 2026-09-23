import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { createRoleGate, evaluateGate } from "./gate.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx = (role: string): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "circle" },
  now: 0,
  frecency: {},
});

const adminOnly: CommandNode = {
  id: "x",
  title: "X",
  gate: { roles: ["admin"] },
  run: async () => ({ kind: "toast", message: "ran" }),
};

describe("createRoleGate - generic role ladders", () => {
  it("the default ladder is viewer < advisor < admin", () => {
    expect(evaluateGate(adminOnly, ctx("viewer"))).toMatchObject({ allowed: false });
    expect(evaluateGate(adminOnly, ctx("admin"))).toMatchObject({ allowed: true });
  });

  it("a custom ladder uses the consumer's own roles", () => {
    const gate = createRoleGate(["reader", "editor", "owner"]);
    const node: CommandNode = { id: "publish", title: "Publish", gate: { roles: ["editor"] } };
    expect(gate(node, ctx("reader")).allowed).toBe(false);
    expect(gate(node, ctx("editor")).allowed).toBe(true);
    expect(gate(node, ctx("owner")).allowed).toBe(true);
  });

  it("an unknown role is below the whole ladder", () => {
    expect(evaluateGate(adminOnly, ctx("ghost")).allowed).toBe(false);
  });
});

describe("async GatePolicy", () => {
  it("executeNode awaits an async gate (real backends)", async () => {
    let asked = false;
    const kernel = createKernel({
      gate: async (node, c) => {
        asked = true;
        await Promise.resolve();
        return evaluateGate(node, c);
      },
    });
    const allowed = await kernel.executeNode(adminOnly, {}, ctx("admin"));
    expect(asked).toBe(true);
    expect(allowed.result?.message).toBe("ran");

    const blocked = await kernel.executeNode(adminOnly, {}, ctx("viewer"));
    expect(blocked.verdict.allowed).toBe(false);
    expect(blocked.result).toBeNull();
  });
});
