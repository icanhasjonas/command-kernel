import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel";
import { pathKey } from "./evidence";
import type { CommandNode, Ctx } from "./types";

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
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async (a) => ({ kind: "toast", message: `reset ${a.user}` }),
};

const users: CommandNode = { id: "users", title: "Users", resolve: async () => [reset] };
const roots: CommandNode[] = [
  users,
  { id: "noop", title: "Toggle theme", run: async () => ({ kind: "toast", message: "ok" }) },
];

// one kernel instance: the same gate + evidence store every driver would share
const k = createKernel({ roots });

describe("command() — the one verb", () => {
  it("returns ranked completions at the root", async () => {
    const r = await k.command({ query: "user" }, ctx());
    expect(r.kind).toBe("completions");
    if (r.kind === "completions") {
      expect(r.items[0]?.kind).toBe("command");
      expect(r.items.some((i) => i.kind === "command" && i.node.id === "users")).toBe(true);
    }
  });

  it("walks a path and completes the next level", async () => {
    const r = await k.command({ path: [{ id: "users" }] }, ctx());
    expect(r.kind).toBe("completions");
    if (r.kind === "completions") {
      expect(r.at?.id).toBe("users");
      expect(r.items.some((i) => i.kind === "command" && i.node.id === "reset")).toBe(true);
    }
  });

  it("root completions are SELF-DESCRIBING (carry a descriptor)", async () => {
    const r = await k.command({}, ctx());
    expect(r.kind).toBe("completions");
    if (r.kind === "completions") {
      const usersItem = r.items.find((i) => i.kind === "command" && i.node.id === "users");
      expect(usersItem?.kind).toBe("command");
      if (usersItem?.kind === "command") {
        // an agent can read what this is + how to navigate it without guessing
        expect(usersItem.descriptor).toMatchObject({
          id: "users",
          navigable: true,
          enumerate: "free",
          safeToScout: true,
        });
      }
    }
  });

  it("asks for missing args before running", async () => {
    const r = await k.command({ path: [{ id: "users" }, { id: "reset" }], execute: true }, ctx());
    expect(r.kind).toBe("args");
    if (r.kind === "args") expect(r.missing).toContain("user");
  });

  it("returns a gate when evidence is insufficient (confirm owed)", async () => {
    const r = await k.command(
      { path: [{ id: "users" }, { id: "reset", args: { user: "a@b.io" } }], execute: true },
      ctx("admin"),
    );
    expect(r.kind).toBe("gate");
  });

  it("executes once a valid per-segment grant is supplied", async () => {
    const grant = k.evidence.sign("reset", { user: "a@b.io" }, pathKey([{ id: "users" }]));
    const r = await k.command(
      {
        path: [{ id: "users" }, { id: "reset", args: { user: "a@b.io" }, evidence: grant }],
        execute: true,
      },
      ctx("admin"),
    );
    expect(r.kind).toBe("result");
    if (r.kind === "result") expect(r.result.message).toBe("reset a@b.io");
  });

  it("rejects a grant bound to a different prior path", async () => {
    // grant minted as if reached directly (empty prior), used under users▸
    const grant = k.evidence.sign("reset", { user: "a@b.io" }, "");
    const r = await k.command(
      {
        path: [{ id: "users" }, { id: "reset", args: { user: "a@b.io" }, evidence: grant }],
        execute: true,
      },
      ctx("admin"),
    );
    expect(r.kind).toBe("gate");
  });

  it("blocks on role even with a valid grant, and honours top-level role", async () => {
    const grant = k.evidence.sign("reset", { user: "a@b.io" }, pathKey([{ id: "users" }]));
    const blocked = await k.command(
      {
        path: [{ id: "users" }, { id: "reset", args: { user: "a@b.io" }, evidence: grant }],
        execute: true,
      },
      ctx("viewer"),
    );
    expect(blocked.kind).toBe("gate");

    // an elevated principal flips the same call to allowed
    const elevated = await k.command(
      {
        path: [{ id: "users" }, { id: "reset", args: { user: "a@b.io" }, evidence: grant }],
        execute: true,
        role: "admin",
      },
      ctx("viewer"),
    );
    expect(elevated.kind).toBe("result");
  });

  it("unknown path yields empty completions, not a throw", async () => {
    const r = await k.command({ path: [{ id: "nope" }] }, ctx());
    expect(r).toEqual({ kind: "completions", at: null, items: [] });
  });
});
