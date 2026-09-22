import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { createKernel } from "./create-kernel.js";
import { forgeDanger } from "./fnv-forge.test-util.js";
import type { CommandNode, Ctx, Grant } from "./types.js";

/**
 * Review round 6, B1: grant forgery. The old FNV-1a tag could be turned from a
 * grant for one act into a grant for another (fnv-forge.test-util.ts). This test
 * runs that attack for real; it must never produce a grant the kernel accepts.
 */

const ran: string[] = [];
const danger: CommandNode = {
  id: "danger",
  title: "Danger",
  gate: { confirm: true },
  args: [{ id: "n", label: "n", kind: "number", required: true }],
  run: async (a) => {
    ran.push(String(a.n));
    return { kind: "toast", message: `ran ${String(a.n)}` };
  },
};

const ctxFor = (id: string): Ctx => ({
  location: { module: "m" },
  user: { id, name: id, role: "admin", brand: "b" },
  now: 0,
  frecency: {},
});

const forge = forgeDanger;

async function approveOne() {
  const k = createKernel({ roots: [danger] });
  const gate = await k.command(
    { path: [{ id: "danger", args: { n: 1 } }], execute: true },
    ctxFor("u1"),
  );
  if (gate.kind !== "gate") throw new Error(gate.kind);
  return { k, grant: k.grantFor(gate) };
}

const call = (k: ReturnType<typeof createKernel>, args: ArgValues, evidence: Grant, who: string) =>
  k.command({ path: [{ id: "danger", args, evidence }], execute: true }, ctxFor(who));

describe("B1: a grant cannot be forged from another grant", () => {
  it("the real grant runs what was approved (the test is not vacuous)", async () => {
    const { k, grant } = await approveOne();
    expect((await call(k, { n: 1 }, grant, "u1")).kind).toBe("result");
  });

  it("a forged grant for {n: 999} is refused", async () => {
    ran.length = 0;
    const { k, grant } = await approveOne();
    const res = await call(k, { n: 999 }, forge(grant, "u1", "999"), "u1");
    expect(res.kind).toBe("gate");
    expect(ran).toEqual([]);
  });

  it("a forged grant for another principal is refused", async () => {
    ran.length = 0;
    const { k, grant } = await approveOne();
    const res = await call(k, { n: 1 }, forge(grant, "u2", "1"), "u2");
    expect(res.kind).toBe("gate");
    expect(ran).toEqual([]);
  });
});
