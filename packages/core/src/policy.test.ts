import { describe, expect, it } from "bun:test";
import { createMemoryPolicyStore, ruleForNode } from "./policy.js";
import type { CommandNode } from "./types.js";

describe("always-allow policy", () => {
  it("command scope matches any args", () => {
    const policy = createMemoryPolicyStore();
    policy.allow({ commandId: "subs.resync", scope: { kind: "command" } });
    expect(policy.match("subs.resync", { id: "sub_1" })).not.toBeNull();
    expect(policy.match("subs.resync", { id: "sub_2" })).not.toBeNull();
    expect(policy.match("users.reset", {})).toBeNull();
  });

  it("arg scope matches only the approved value", () => {
    const policy = createMemoryPolicyStore();
    policy.allow({
      commandId: "users.reset",
      scope: { kind: "arg", argId: "user", value: "a@b.io" },
    });
    expect(policy.match("users.reset", { user: "a@b.io" })).not.toBeNull();
    expect(policy.match("users.reset", { user: "c@d.io" })).toBeNull();
  });

  it("prefix scope matches a folder-ish arg", () => {
    const policy = createMemoryPolicyStore();
    policy.allow({
      commandId: "files.open",
      scope: { kind: "prefix", argId: "path", prefix: "forms/ip/" },
    });
    expect(policy.match("files.open", { path: "forms/ip/long-form" })).not.toBeNull();
    expect(policy.match("files.open", { path: "forms/surrogate/x" })).toBeNull();
  });

  it("revoke and clear drop standing rules", () => {
    const policy = createMemoryPolicyStore();
    const rule = { commandId: "subs.resync", scope: { kind: "command" } } as const;
    policy.allow(rule);
    policy.revoke(rule);
    expect(policy.match("subs.resync", {})).toBeNull();
    policy.allow(rule);
    expect(policy.list()).toHaveLength(1);
    policy.clear();
    expect(policy.list()).toHaveLength(0);
  });

  it("ruleForNode binds to an entity/email arg when present, else the command", () => {
    const withEmail: CommandNode = {
      id: "users.reset",
      title: "Send password reset",
      args: [{ id: "user", label: "user", kind: "email", required: true }],
    };
    expect(ruleForNode(withEmail, { user: "a@b.io" }).scope).toEqual({
      kind: "arg",
      argId: "user",
      value: "a@b.io",
    });

    const noEntity: CommandNode = { id: "theme.toggle", title: "Toggle theme" };
    expect(ruleForNode(noEntity, {}).scope).toEqual({ kind: "command" });
  });

  it("SEAM: stores are independent (no module global)", () => {
    const a = createMemoryPolicyStore();
    const b = createMemoryPolicyStore();
    a.allow({ commandId: "x", scope: { kind: "command" } });
    expect(a.match("x", {})).not.toBeNull();
    expect(b.match("x", {})).toBeNull();
  });
});
