import { describe, expect, it } from "bun:test";
import { describeNode, describeTree, effectMode, enumerateMode } from "./describe.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx = (role: Ctx["user"]["role"] = "admin"): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "circle" },
  now: 0,
  frecency: {},
});

const category: CommandNode = {
  id: "users",
  title: "Users",
  summary: "People with accounts.",
  resolve: async () => [],
};

const search: CommandNode = {
  id: "users.search",
  title: "Search users",
  args: [{ id: "q", label: "query", kind: "entity", positional: true, complete: async () => [] }],
  resolve: async () => [],
  run: async () => ({ kind: "page", message: "results" }),
};

const gatedAction: CommandNode = {
  id: "users.reset",
  title: "Send password reset",
  gate: { roles: ["admin"], confirm: true, reason: "irreversible" },
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async () => ({ kind: "toast", message: "sent" }),
};

const navAction: CommandNode = {
  id: "go.home",
  title: "Go to Home",
  run: async () => ({ kind: "navigate", message: "home" }),
};

describe("enumerateMode / effectMode inference", () => {
  it("a static category is free to enumerate", () => {
    expect(enumerateMode(category)).toBe("free");
  });

  it("a node with a positional (search) arg is query - must not be blindly listed", () => {
    expect(enumerateMode(search)).toBe("query");
  });

  it("a node with no resolve has no enumerate mode", () => {
    expect(enumerateMode(gatedAction)).toBeNull();
  });

  it("a gated run is 'writes'; an ungated run is 'pure'", () => {
    expect(effectMode(gatedAction)).toBe("writes");
    expect(effectMode(navAction)).toBe("pure");
  });

  it("explicit enumerate/effect override the inference", () => {
    expect(enumerateMode({ ...category, enumerate: "query" })).toBe("query");
    expect(effectMode({ ...navAction, effect: "writes" })).toBe("writes");
  });
});

describe("describeNode - the self-description an agent reads", () => {
  it("describes a navigable, safe-to-scout category", () => {
    const d = describeNode(category);
    expect(d).toMatchObject({
      id: "users",
      summary: "People with accounts.",
      navigable: true,
      enumerate: "free",
      executable: false,
      effect: null,
      safeToScout: true,
    });
  });

  it("flags a query branch as NOT safe to scout", () => {
    const d = describeNode(search);
    expect(d.enumerate).toBe("query");
    expect(d.safeToScout).toBe(false);
    expect(d.args[0]).toMatchObject({ id: "q", positional: true, options: "async" });
  });

  it("surfaces gate + effect for a writing action", () => {
    const d = describeNode(gatedAction);
    expect(d.executable).toBe(true);
    expect(d.effect).toBe("writes");
    expect(d.gate).toEqual({ roles: ["admin"], confirm: true, reason: "irreversible" });
    expect(d.args[0]).toMatchObject({ id: "user", required: true, options: "free" });
  });

  it("falls back to subtitle when summary is absent", () => {
    const d = describeNode({ id: "x", title: "X", subtitle: "terse caption" });
    expect(d.summary).toBe("terse caption");
  });
});

describe("describeTree - the root taxonomy", () => {
  it("respects when() against the context", () => {
    const nodes: CommandNode[] = [
      { id: "always", title: "Always" },
      { id: "adminOnly", title: "Admin only", when: (c) => c.user.role === "admin" },
    ];
    expect(describeTree(nodes, ctx("viewer")).map((d) => d.id)).toEqual(["always"]);
    expect(describeTree(nodes, ctx("admin")).map((d) => d.id)).toEqual(["always", "adminOnly"]);
  });
});
