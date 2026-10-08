import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import type { CommandNode, Ctx } from "./types.js";

const as = (role: string): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "c" },
  now: 0,
  frecency: {},
});

let runs = 0;
const reset: CommandNode = {
  id: "reset",
  title: "Send password reset",
  gate: { roles: ["admin"], confirm: true },
  args: [{ id: "user", label: "user", kind: "string", required: true }],
  run: async () => {
    runs += 1;
    return { kind: "toast", message: "sent" };
  },
};

describe("preflight: the gate asked before the args are in", () => {
  const k = createKernel({ roots: [reset] });

  it("says no to a role the gate refuses, with no args yet and nothing run", async () => {
    const v = await k.preflight(reset, as("viewer"));
    expect(v.allowed).toBe(false);
    expect(v.checks.find((c) => !c.ok)?.label).toBe("role: admin");
    expect(runs).toBe(0);
  });

  it("says yes (confirm still owed) where the role will do", async () => {
    const v = await k.preflight(reset, as("admin"));
    expect(v).toMatchObject({ allowed: true, needsConfirm: true });
  });

  it("is advice: the run still goes through the whole gate", async () => {
    const out = await k.executeNode(reset, { user: "jon" }, as("viewer"));
    expect(out.result).toBeNull();
    expect(out.verdict.allowed).toBe(false);
  });
});
