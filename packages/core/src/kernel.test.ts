import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { bindingKey } from "./evidence.js";
import { fuzzyMatch } from "./fuzzy.js";
import { evaluateGate } from "./gate.js";
import { missingArgs } from "./kernel.js";
import { rank } from "./rank.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx = (role: Ctx["user"]["role"] = "admin"): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "Test", role, brand: "circle" },
  now: 0,
  frecency: {},
});

describe("fuzzyMatch", () => {
  it("returns null when not a subsequence", () => {
    expect(fuzzyMatch("zzz", "Resend confirmation")).toBeNull();
  });

  it("reports matched offsets for highlighting", () => {
    const r = fuzzyMatch("rsd", "Resend draft");
    expect(r).not.toBeNull();
    expect(r?.positions.length).toBe(3);
  });

  it("rewards word-boundary matches over mid-word ones", () => {
    const boundary = fuzzyMatch("rc", "Resend Confirmation"); // R..C boundary
    const midword = fuzzyMatch("rc", "Search cache"); // r in seaRch? no -> use mid
    expect(boundary).not.toBeNull();
    expect(midword).not.toBeNull();
    expect((boundary as { score: number }).score).toBeGreaterThan(
      (midword as { score: number }).score,
    );
  });

  it("empty query is a neutral match", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, positions: [] });
  });
});

describe("rank", () => {
  const nodes: CommandNode[] = [
    { id: "a", title: "Resend confirmation", weight: 10 },
    { id: "b", title: "Resend confirmation", weight: 90 },
  ];

  it("uses static weight to break a text-score tie", () => {
    const out = rank(nodes, "resend", ctx());
    expect(out[0]?.node.id).toBe("b"); // higher weight wins
  });

  it("applies context boost", () => {
    const boosted: CommandNode[] = [
      {
        id: "x",
        title: "Re-sync",
        weight: 0,
        boost: (c) => (c.location.module === "subs" ? 500 : 0),
      },
      { id: "y", title: "Re-sync", weight: 40 },
    ];
    const here = { ...ctx(), location: { module: "subs" } };
    expect(rank(boosted, "sync", here)[0]?.node.id).toBe("x");
  });

  it("hides nodes failing their `when`", () => {
    const hidden: CommandNode[] = [
      { id: "z", title: "Admin only", when: (c) => c.user.role === "admin" },
    ];
    expect(rank(hidden, "", ctx("viewer"))).toHaveLength(0);
    expect(rank(hidden, "", ctx("admin"))).toHaveLength(1);
  });
});

describe("gate enforcement (via the kernel's trust core)", () => {
  const reset: CommandNode = {
    id: "users.reset",
    title: "Send password reset",
    gate: { roles: ["admin"], confirm: true },
    run: async () => ({ kind: "toast", message: "sent" }),
  };

  it("blocks a viewer (role check fails)", async () => {
    const k = createKernel();
    const out = await k.executeNode(reset, {}, ctx("viewer"));
    expect(out.result).toBeNull();
    expect(out.verdict.allowed).toBe(false);
  });

  it("an admin still owes a confirm with no evidence", async () => {
    const k = createKernel();
    const pending = await k.executeNode(reset, {}, ctx("admin"));
    expect(pending.awaitingConfirm).toBe(true);
    expect(pending.result).toBeNull();
  });

  it("runs once a valid grant for these exact args is supplied", async () => {
    const k = createKernel();
    // bound to the principal (ctx.user.id by default) and the empty prior path
    const grant = k.evidence.sign("users.reset", { user: "a@b.io" }, bindingKey("u1", ""));
    const done = await k.executeNode(reset, { user: "a@b.io" }, ctx("admin"), {
      grant,
      priorKey: "",
    });
    expect(done.result?.message).toBe("sent");
  });

  it("rejects a grant minted for DIFFERENT args (binding holds)", async () => {
    const k = createKernel();
    const grant = k.evidence.sign("users.reset", { user: "a@b.io" }, "");
    const out = await k.executeNode(reset, { user: "evil@x.io" }, ctx("admin"), {
      grant,
      priorKey: "",
    });
    expect(out.awaitingConfirm).toBe(true);
    expect(out.result).toBeNull();
  });

  it("rejects a forged grant (cannot fake an Allow)", async () => {
    const k = createKernel();
    const out = await k.executeNode(reset, {}, ctx("admin"), {
      grant: { nonce: "forged", sig: "deadbeef" },
      priorKey: "",
    });
    expect(out.awaitingConfirm).toBe(true);
  });

  it("an always-allow rule satisfies the gate without any grant", async () => {
    const k = createKernel();
    k.policy.allow({ commandId: "users.reset", scope: { kind: "command" } });
    const out = await k.executeNode(reset, { user: "a@b.io" }, ctx("admin"));
    expect(out.autoAllowed).toBe(true);
    expect(out.result?.message).toBe("sent");
  });

  it("evaluateGate is pure and reusable by any renderer", () => {
    expect(evaluateGate(reset, ctx("advisor")).allowed).toBe(false);
    expect(evaluateGate(reset, ctx("admin")).allowed).toBe(true);
  });
});

describe("missingArgs", () => {
  it("counts unfilled required args", () => {
    const node: CommandNode = {
      id: "send",
      title: "Send email",
      args: [
        { id: "to", label: "to", kind: "entity", required: true },
        { id: "subject", label: "subject", kind: "string", required: true },
        { id: "body", label: "body", kind: "text", required: false },
      ],
    };
    expect(missingArgs(node, { to: "a@b.io" })).toEqual(["subject"]);
    expect(missingArgs(node, { to: "a@b.io", subject: "hi" })).toEqual([]);
  });
});
