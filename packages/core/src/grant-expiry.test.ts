import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { createHmacEvidenceStore, createMemoryEvidenceStore } from "./evidence.js";
import type { CommandNode, Ctx, Grant } from "./types.js";

/**
 * Wire review round 4, W2 (the core half): a grant expires, and a host can make it
 * single-use. The expiry is inside the signed payload (issued on the kernel's clock
 * plus the store's TTL, default 5 minutes) and checked on that clock on use; `spend`
 * is asked once a grant has verified, before run().
 */

const ARGS = { user: "a@b.io" };
const at = (now: number): Ctx => ({
  location: { module: "m" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now,
  frecency: {},
});

let runs = 0;
const reset: CommandNode = {
  id: "reset",
  title: "Reset",
  gate: { confirm: true },
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async () => {
    runs++;
    return { kind: "toast", message: "reset" };
  },
};

describe("a grant expires", () => {
  it("verifies until its expiry and not a millisecond after", () => {
    const store = createHmacEvidenceStore(new Uint8Array(32).fill(1), { ttlMs: 1000 });
    const g = store.sign("reset", ARGS, "", { now: 0 });
    expect(g.expiresAt).toBe(1000);
    expect(store.verify(g, "reset", ARGS, "", 1000)).toBe(true);
    expect(store.verify(g, "reset", ARGS, "", 1001)).toBe(false);
  });

  it("the expiry is signed: moving it later breaks the grant", () => {
    const store = createMemoryEvidenceStore();
    const g = store.sign("reset", ARGS, "", { now: 0 });
    expect(store.verify({ ...g, expiresAt: 10 ** 12 }, "reset", ARGS, "", 0)).toBe(false);
    const { expiresAt: _, ...bare } = g;
    expect(store.verify(bare, "reset", ARGS, "", 0)).toBe(false);
  });

  // core review round 7: on the kernel's clock (KernelConfig.now), never ctx.now
  it("the kernel mints on its clock and refuses the grant 5 minutes later", async () => {
    let clock = 0;
    const k = createKernel({ roots: [reset], now: () => clock });
    const gate = await k.command({ path: [{ id: "reset", args: ARGS }], execute: true }, at(0));
    if (gate.kind !== "gate") throw new Error(gate.kind);
    const evidence = k.grantFor(gate);
    const use = (now: number) => {
      clock = now;
      return k.command({ path: [{ id: "reset", args: ARGS, evidence }], execute: true }, at(0));
    };
    expect((await use(5 * 60_000 + 1)).kind).toBe("gate");
    expect((await use(5 * 60_000)).kind).toBe("result");
  });
});

describe("spend: a single-use grant", () => {
  it("is asked once the grant verifies; false leaves the confirm owed", async () => {
    runs = 0;
    const k = createKernel({ roots: [reset] });
    const gate = await k.command({ path: [{ id: "reset", args: ARGS }], execute: true }, at(0));
    if (gate.kind !== "gate") throw new Error(gate.kind);
    const evidence = k.grantFor(gate);
    const spent = new Set<string>();
    const spend = (g: Grant) => {
      if (spent.has(g.nonce)) return false;
      spent.add(g.nonce);
      return true;
    };
    const use = () =>
      k.command({ path: [{ id: "reset", args: ARGS, evidence }], execute: true, spend }, at(0));
    expect((await use()).kind).toBe("result");
    expect((await use()).kind).toBe("gate");
    expect(runs).toBe(1);
  });

  it("is never asked for a grant that does not verify", async () => {
    let asked = 0;
    const k = createKernel({ roots: [reset] });
    const evidence = { nonce: "x", sig: "y", expiresAt: 1 };
    const spend = () => {
      asked++;
      return true;
    };
    await k.command({ path: [{ id: "reset", args: ARGS, evidence }], execute: true, spend }, at(0));
    expect(asked).toBe(0);
  });
});
