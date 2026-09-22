import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { createHmacEvidenceStore, createMemoryEvidenceStore } from "./evidence.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * B1: the default store is an HMAC-SHA256 signature under a 32-byte key, and
 * `createHmacEvidenceStore(key)` lets several isolates share one key.
 */

const key = (byte: number) => new Uint8Array(32).fill(byte);
const ARGS = { user: "a@b.io" };

const reset: CommandNode = {
  id: "reset",
  title: "Reset",
  gate: { confirm: true },
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async () => ({ kind: "toast", message: "reset" }),
};
const ctx: Ctx = {
  location: { module: "m" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

describe("createHmacEvidenceStore", () => {
  it("a grant minted by one store verifies in another holding the same key", () => {
    const g = createHmacEvidenceStore(key(7)).sign("reset", ARGS, "p");
    expect(createHmacEvidenceStore(key(7)).verify(g, "reset", ARGS, "p")).toBe(true);
  });

  it("a different key refuses it", () => {
    const g = createHmacEvidenceStore(key(7)).sign("reset", ARGS, "p");
    expect(createHmacEvidenceStore(key(8)).verify(g, "reset", ARGS, "p")).toBe(false);
  });

  it("a kernel in a second isolate runs a grant minted by the first", async () => {
    const a = createKernel({ roots: [reset], evidence: createHmacEvidenceStore(key(3)) });
    const b = createKernel({ roots: [reset], evidence: createHmacEvidenceStore(key(3)) });
    const gate = await a.command({ path: [{ id: "reset", args: ARGS }], execute: true }, ctx);
    if (gate.kind !== "gate") throw new Error(gate.kind);
    const evidence = a.grantFor(gate);
    const res = await b.command(
      { path: [{ id: "reset", args: ARGS, evidence }], execute: true },
      ctx,
    );
    expect(res.kind).toBe("result");
  });

  it("refuses a key shorter than 32 bytes", () => {
    expect(() => createHmacEvidenceStore(new Uint8Array(16))).toThrow();
  });

  it("copies the key, so changing the caller's array later changes nothing", () => {
    const k = key(5);
    const store = createHmacEvidenceStore(k);
    const g = store.sign("reset", ARGS, "");
    k.fill(0);
    expect(store.verify(g, "reset", ARGS, "")).toBe(true);
  });

  it("the signature is a full SHA-256 (64 hex characters)", () => {
    expect(createMemoryEvidenceStore().sign("reset", ARGS, "").sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a tag with the right length but one wrong character is refused", () => {
    const store = createMemoryEvidenceStore();
    const g = store.sign("reset", ARGS, "");
    const flipped = (g.sig[0] === "0" ? "1" : "0") + g.sig.slice(1);
    expect(store.verify({ ...g, sig: flipped }, "reset", ARGS, "")).toBe(false);
  });
});
