import { describe, expect, it } from "bun:test";
import type { ArgValues } from "./args.js";
import { createKernel } from "./create-kernel.js";
import type { CommandNode, Ctx, Grant } from "./types.js";

/**
 * Review round 6, B1: grant forgery.
 *
 * The old tag was FNV-1a over `prior|cmd(args)|nonce|salt`. FNV's 32-bit state runs
 * backwards, the secret salt came LAST, and verify took any caller nonce: so from one
 * real grant an attacker computes the state just before the salt, then searches a
 * nonce (3 + 3 characters, meet in the middle) that drives a forged prefix to that
 * same state. The salt then finishes both to the same tag. This test runs that
 * attack for real; it must never produce a grant the kernel accepts.
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

// FNV-1a forwards, and backwards with the inverse of its prime (mod 2^32)
const PRIME = 0x01000193;
let INV = PRIME;
for (let i = 0; i < 5; i++) INV = Math.imul(INV, 2 - Math.imul(PRIME, INV)) >>> 0;
const forward = (h: number, s: string) => {
  let x = h;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), PRIME) >>> 0;
  return x;
};
const backward = (h: number, s: string) => {
  let x = h;
  for (let i = s.length - 1; i >= 0; i--) x = (Math.imul(x, INV) ^ s.charCodeAt(i)) >>> 0;
  return x;
};

const ABC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const triples = function* () {
  for (const a of ABC) for (const b of ABC) for (const c of ABC) yield a + b + c;
};

/** A nonce that takes `head` to the same pre-salt state `known` reached. */
function collide(head: string, known: string): string {
  const target = backward(forward(0x811c9dc5, known), "|");
  const start = forward(0x811c9dc5, head);
  const seen = new Map<number, string>();
  for (const x of triples()) seen.set(forward(start, x), x);
  for (const y of triples()) {
    const x = seen.get(backward(target, y));
    if (x !== undefined) return x + y;
  }
  throw new Error("no collision found");
}

/** Forge a grant for (principal, args) from a real one for u1 and {n: 1}. */
function forge(real: Grant, principal: string, n: string): Grant {
  const known = `u1||danger(n=1)|${real.nonce}|`;
  return { nonce: collide(`${principal}||danger(n=${n})|`, known), sig: real.sig };
}

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
