import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import type { EvidenceStore } from "./evidence.js";
import type { GatePolicy } from "./gate.js";
import type { PolicyStore } from "./policy.js";
import type { Ranker } from "./rank.js";
import { createRegistry } from "./registry.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx = (role: Ctx["user"]["role"] = "admin"): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "circle" },
  now: 0,
  frecency: {},
});

const reset: CommandNode = {
  id: "reset",
  title: "Send password reset",
  gate: { roles: ["admin"], confirm: true },
  run: async () => ({ kind: "toast", message: "sent" }),
};

describe("createKernel — defaults stay trivial", () => {
  it("zero-config kernel ranks + completes with stock everything", async () => {
    const k = createKernel({
      roots: [
        { id: "a", title: "Apple" },
        { id: "b", title: "Banana" },
      ],
    });
    const r = await k.command({ query: "ban" }, ctx());
    expect(r.kind).toBe("completions");
    if (r.kind === "completions")
      expect(r.items[0]?.kind === "command" && r.items[0].node.id).toBe("b");
  });
});

describe("SEAM 1 — Ranker", () => {
  it("a custom ranker replaces the blend (reverse-alphabetical here)", async () => {
    const reverseAlpha: Ranker = (nodes) =>
      nodes
        .map((node) => ({ node, score: 0, positions: [] as number[] }))
        .sort((a, b) => b.node.title.localeCompare(a.node.title));
    const k = createKernel({
      roots: [
        { id: "a", title: "Apple" },
        { id: "z", title: "Zebra" },
      ],
      ranker: reverseAlpha,
    });
    const r = await k.command({}, ctx());
    if (r.kind === "completions") {
      expect(r.items[0]?.kind === "command" && r.items[0].node.id).toBe("z");
    } else throw new Error("expected completions");
  });
});

describe("SEAM 2 — GatePolicy", () => {
  it("a custom gate is the authority — it can block an otherwise-open node", async () => {
    const denyAll: GatePolicy = () => ({
      allowed: false,
      needsConfirm: false,
      checks: [{ label: "locked by policy", ok: false }],
    });
    const open: CommandNode = {
      id: "open",
      title: "Open thing",
      run: async () => ({ kind: "toast", message: "ran" }),
    };
    const k = createKernel({ gate: denyAll });
    const out = await k.executeNode(open, {}, ctx("admin"));
    expect(out.verdict.allowed).toBe(false);
    expect(out.result).toBeNull();
  });
});

describe("SEAM 3 — EvidenceStore", () => {
  it("the store owns verification — a trusting store satisfies the confirm", async () => {
    const trusting: EvidenceStore = {
      sign: (_c, _a, _p, nonce = "n") => ({ nonce, sig: "stub" }),
      verify: () => true, // the whole point: executeNode delegates trust here
      grantForPath: () => ({ nonce: "n", sig: "stub" }),
      rotate: () => {},
    };
    const k = createKernel({ evidence: trusting });
    const out = await k.executeNode(reset, { user: "a@b.io" }, ctx("admin"), {
      grant: { nonce: "anything", sig: "anything" },
      priorKey: "",
    });
    expect(out.result?.message).toBe("sent");
  });
});

describe("SEAM 4 — PolicyStore", () => {
  it("a custom policy that always matches auto-satisfies the gate (no grant)", async () => {
    const openPolicy: PolicyStore = {
      allow: () => {},
      revoke: () => {},
      list: () => [],
      clear: () => {},
      match: () => ({ commandId: "*", scope: { kind: "command" } }),
    };
    const k = createKernel({ policy: openPolicy });
    const out = await k.executeNode(reset, {}, ctx("admin"));
    expect(out.autoAllowed).toBe(true);
    expect(out.result?.message).toBe("sent");
  });
});

describe("SEAM 5 — Registry", () => {
  it("assembles static + lazy contextual providers; command() uses them", async () => {
    const base: CommandNode = { id: "base", title: "Base" };
    const adminOnly: CommandNode = { id: "danger", title: "Danger Zone" };
    const registry = createRegistry([base]).register((c) =>
      c.user.role === "admin" ? [adminOnly] : [],
    );
    const k = createKernel({ registry });

    expect(k.roots(ctx("admin")).map((n) => n.id)).toEqual(["base", "danger"]);
    expect(k.roots(ctx("viewer")).map((n) => n.id)).toEqual(["base"]);

    const r = await k.command({ query: "danger" }, ctx("admin"));
    if (r.kind === "completions") {
      expect(r.items.some((i) => i.kind === "command" && i.node.id === "danger")).toBe(true);
    } else throw new Error("expected completions");
  });
});
