import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { createHmacEvidenceStore } from "./evidence.js";
import { createMemoryPolicyStore, ruleForNode } from "./policy.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * Core review round 7, the trust half: C5 (a store's TTL caps every grant it
 * accepts), C6 (an always-allow rule over a list value) and the kernel clock (C8 and
 * the core half of wire W2): grant expiry is measured on `KernelConfig.now`, never on
 * a `ctx.now` a host may have built once and kept.
 */

const KEY = new Uint8Array(32).fill(7);
const MIN = 60_000;

describe("C5: a store's ttlMs caps grants minted elsewhere with the same key", () => {
  it("refuses a grant whose expiry is further away than its own TTL", () => {
    const long = createHmacEvidenceStore(KEY, { ttlMs: 60 * MIN });
    const short = createHmacEvidenceStore(KEY, { ttlMs: MIN });
    const g = long.sign("x", {}, "", { now: 0 });
    expect(long.verify(g, "x", {}, "", 0)).toBe(true);
    expect(short.verify(g, "x", {}, "", 0)).toBe(false);
    // once the remaining lifetime fits inside the short TTL, it is honoured
    expect(short.verify(g, "x", {}, "", 59 * MIN)).toBe(true);
    expect(short.verify(short.sign("x", {}, "", { now: 0 }), "x", {}, "", 0)).toBe(true);
  });
});

describe("C6: an arg rule over a list covers every value or none", () => {
  const send: CommandNode = {
    id: "send",
    title: "Send",
    gate: { confirm: true },
    args: [{ id: "to", label: "to", kind: "email", multiple: true }],
  };

  it("a rule for one recipient does not match a list that adds another", () => {
    const store = createMemoryPolicyStore();
    store.allow(ruleForNode(send, { to: ["jon@x.io"] }));
    expect(store.match("send", { to: ["jon@x.io", "evil@y.io"] })).toBeNull();
    expect(store.match("send", { to: ["jon@x.io"] })).not.toBeNull();
    expect(store.match("send", { to: "jon@x.io" })).not.toBeNull();
    expect(store.match("send", { to: [] })).toBeNull();
  });

  it("a prefix rule needs every value under the prefix", () => {
    const store = createMemoryPolicyStore();
    store.allow({ commandId: "send", scope: { kind: "prefix", argId: "to", prefix: "jon@" } });
    expect(store.match("send", { to: ["jon@x.io", "jon@y.io"] })).not.toBeNull();
    expect(store.match("send", { to: ["jon@x.io", "evil@y.io"] })).toBeNull();
  });
});

describe("W2 (core): grant expiry runs on the kernel's clock", () => {
  const reset: CommandNode = {
    id: "reset",
    title: "Reset",
    gate: { confirm: true },
    run: async () => ({ kind: "toast", message: "reset" }),
  };
  // a ctx built once (on a socket upgrade) and kept: its `now` never moves
  const frozen: Ctx = {
    location: { module: "m" },
    user: { id: "u1", name: "U", role: "admin", brand: "b" },
    now: 0,
    frecency: {},
  };
  const PATH = [{ id: "reset" }];

  it("a grant used 10 minutes later with a frozen ctx has expired", async () => {
    let clock = 1_000_000;
    const k = createKernel({ roots: [reset], now: () => clock });
    const gate = await k.command({ path: PATH, execute: true }, frozen);
    if (gate.kind !== "gate") throw new Error(gate.kind);
    expect(gate.now).toBe(1_000_000);
    const evidence = k.grantFor(gate);
    const use = () => k.command({ path: [{ id: "reset", evidence }], execute: true }, frozen);
    clock += MIN;
    expect((await use()).kind).toBe("result");
    clock += 10 * MIN;
    expect((await use()).kind).toBe("gate");
  });

  it("a fresh grant works on an old ctx", async () => {
    const k = createKernel({ roots: [reset], now: () => 10 ** 12 });
    const gate = await k.command({ path: PATH, execute: true }, frozen);
    if (gate.kind !== "gate") throw new Error(gate.kind);
    // minted without a `now`: the kernel's clock, not the ctx's
    const { now: _, ...asked } = gate;
    const evidence = k.grantFor(asked);
    expect(evidence.expiresAt).toBe(10 ** 12 + 5 * MIN);
    const ran = await k.command({ path: [{ id: "reset", evidence }], execute: true }, frozen);
    expect(ran.kind).toBe("result");
  });
});
