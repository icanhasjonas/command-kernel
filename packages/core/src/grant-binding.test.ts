import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * THE GRANT BINDS TO WHAT WILL RUN — regression.
 *
 * A grant is signed over (prior path, command, args). The kernel DERIVES the
 * args it runs with: `prefill(ctx)` merges defaults in, and an entity-typed arg
 * auto-resolves a single search match to that entity's id. If a driver mints its
 * grant over the args it typed, verification is checked against values the
 * kernel derived afterwards and can never match — the human clicks Allow, the
 * gate re-asks, forever.
 *
 * So the `gate` response carries the EFFECTIVE args + the prior-path key, and
 * `kernel.grantFor(res)` is the one correct mint. These tests pin both halves:
 * the loop is closed, and the honesty property (a grant for OTHER args is still
 * worthless) survives the fix.
 */

const ctx: Ctx = {
  location: { module: "submissions", recordId: "sub_4819" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};

const people = [
  { id: "u_1", label: "Jon Snow", hint: "jon@wall.north" },
  { id: "u_2", label: "Arya Stark", hint: "arya@wf.north" },
];

const personType = {
  name: "person",
  search: async (q: string) =>
    people.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())),
  get: async (id: string) => people.find((p) => p.id === id) ?? null,
};

const emailPerson: CommandNode = {
  id: "email.send",
  title: "Email a person",
  gate: { confirm: true, reason: "sends a real email" },
  args: [{ id: "to", label: "To", kind: "entity", required: true, entity: { type: "person" } }],
  run: async (a) => ({ kind: "toast", message: `sent to ${String(a.to)}` }),
};

const resync: CommandNode = {
  id: "sub.resync",
  title: "Resync submission",
  gate: { confirm: true },
  prefill: (c) => ({ submissionId: c.location.recordId ?? "" }),
  args: [{ id: "submissionId", label: "Submission", kind: "string", required: true }],
  run: async (a) => ({ kind: "toast", message: `resynced ${String(a.submissionId)}` }),
};

describe("grant binding survives arg derivation", () => {
  it("an entity arg that auto-resolves still verifies its grant", async () => {
    const k = createKernel({ roots: [emailPerson], entities: [personType] });
    // "Snow" matches exactly one person -> the kernel resolves it to `u_1`
    const gate = await k.command(
      { path: [{ id: "email.send", args: { to: "Snow" } }], execute: true },
      ctx,
    );
    expect(gate.kind).toBe("gate");
    if (gate.kind !== "gate") return;
    expect(gate.args.to).toBe("u_1"); // the response shows what will actually run

    const ran = await k.command(
      {
        path: [{ id: "email.send", args: { to: "Snow" }, evidence: k.grantFor(gate) }],
        execute: true,
      },
      ctx,
    );
    expect(ran.kind).toBe("result");
    if (ran.kind === "result") expect(ran.result.message).toBe("sent to u_1");
  });

  it("a prefilled arg still verifies its grant", async () => {
    const k = createKernel({ roots: [resync] });
    const gate = await k.command({ path: [{ id: "sub.resync" }], execute: true }, ctx);
    expect(gate.kind).toBe("gate");
    if (gate.kind !== "gate") return;
    expect(gate.args.submissionId).toBe("sub_4819"); // came from prefill, not the caller

    const ran = await k.command(
      { path: [{ id: "sub.resync", evidence: k.grantFor(gate) }], execute: true },
      ctx,
    );
    expect(ran.kind).toBe("result");
  });

  it("the grant is still worthless for a DIFFERENT command's args", async () => {
    const k = createKernel({ roots: [emailPerson], entities: [personType] });
    const gate = await k.command(
      { path: [{ id: "email.send", args: { to: "Snow" } }], execute: true },
      ctx,
    );
    if (gate.kind !== "gate") throw new Error("expected a gate");
    const grant = k.grantFor(gate);

    // same grant, different recipient -> the kernel re-asks
    const swapped = await k.command(
      { path: [{ id: "email.send", args: { to: "Arya" }, evidence: grant }], execute: true },
      ctx,
    );
    expect(swapped.kind).toBe("gate");
  });

  it("a forged grant is still rejected", async () => {
    const k = createKernel({ roots: [resync] });
    const res = await k.command(
      {
        path: [{ id: "sub.resync", evidence: { nonce: "forged", sig: "deadbeef" } }],
        execute: true,
      },
      ctx,
    );
    expect(res.kind).toBe("gate");
  });
});
