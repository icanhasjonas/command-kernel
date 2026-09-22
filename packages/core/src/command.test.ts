import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { bindingKey, pathKey } from "./evidence.js";
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
// a grant's binding context: the principal (ctx.user.id by default), then the prior path
const underUsers = bindingKey("u1", pathKey([{ id: "users" }]));

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

  it("rejects present-but-invalid args before the gate (agent hallucination guard)", async () => {
    const r = await k.command(
      { path: [{ id: "users" }, { id: "reset", args: { user: "not-an-email" } }], execute: true },
      ctx("admin"),
    );
    expect(r.kind).toBe("args");
    if (r.kind === "args") {
      expect(r.errors.map((e) => e.argId)).toContain("user");
      expect(r.missing).toEqual([]); // it's present, just invalid
    }
  });

  it("returns a gate when evidence is insufficient (confirm owed)", async () => {
    const r = await k.command(
      { path: [{ id: "users" }, { id: "reset", args: { user: "a@b.io" } }], execute: true },
      ctx("admin"),
    );
    expect(r.kind).toBe("gate");
  });

  it("executes once a valid per-segment grant is supplied", async () => {
    const grant = k.evidence.sign("reset", { user: "a@b.io" }, underUsers);
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
    const grant = k.evidence.sign("reset", { user: "a@b.io" }, bindingKey("u1", ""));
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
    const grant = k.evidence.sign("reset", { user: "a@b.io" }, underUsers);
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

  it("full loop: gate -> mint grantForPath -> re-issue with evidence -> result", async () => {
    const tip = { id: "reset", args: { user: "jon@wall.north" } };
    // 1. no evidence on the tip -> the kernel demands approval
    const gated = await k.command({ path: [{ id: "users" }, tip], execute: true }, ctx("admin"));
    expect(gated.kind).toBe("gate");
    // 2. the human approves -> the bridge mints a grant bound to THIS exact chain
    const grant = k.evidence.grantForPath([{ id: "users" }, tip], k.principalOf(ctx("admin")));
    // 3. re-issue the identical call with the grant as the tip's evidence -> runs
    const done = await k.command(
      { path: [{ id: "users" }, { ...tip, evidence: grant }], execute: true },
      ctx("admin"),
    );
    expect(done.kind === "result" && done.result.message).toBe("reset jon@wall.north");
  });

  it("an always-allow rule lets command() run a gated tip with NO evidence", async () => {
    k.policy.allow({ commandId: "reset", scope: { kind: "command" } });
    const r = await k.command(
      { path: [{ id: "users" }, { id: "reset", args: { user: "a@b.io" } }], execute: true },
      ctx("admin"),
    );
    expect(r.kind).toBe("result");
    k.policy.clear(); // shared kernel — don't leak the rule into sibling tests
  });

  it("unknown path yields empty completions, not a throw", async () => {
    const r = await k.command({ path: [{ id: "nope" }] }, ctx());
    expect(r).toEqual({ kind: "completions", at: null, items: [] });
  });
});
