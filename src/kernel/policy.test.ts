import { afterEach, describe, expect, it } from "vitest";
import { allowAlways, clearAllowRules, matchingAllow, ruleForNode } from "./policy";
import type { CommandNode } from "./types";

describe("always-allow policy", () => {
  afterEach(() => clearAllowRules());

  it("command scope matches any args", () => {
    allowAlways({ commandId: "subs.resync", scope: { kind: "command" } });
    expect(matchingAllow("subs.resync", { id: "sub_1" })).not.toBeNull();
    expect(matchingAllow("subs.resync", { id: "sub_2" })).not.toBeNull();
    expect(matchingAllow("users.reset", {})).toBeNull();
  });

  it("arg scope matches only the approved value", () => {
    allowAlways({
      commandId: "users.reset",
      scope: { kind: "arg", argId: "user", value: "a@b.io" },
    });
    expect(matchingAllow("users.reset", { user: "a@b.io" })).not.toBeNull();
    expect(matchingAllow("users.reset", { user: "c@d.io" })).toBeNull();
  });

  it("prefix scope matches a folder-ish arg", () => {
    allowAlways({
      commandId: "files.open",
      scope: { kind: "prefix", argId: "path", prefix: "forms/ip/" },
    });
    expect(matchingAllow("files.open", { path: "forms/ip/long-form" })).not.toBeNull();
    expect(matchingAllow("files.open", { path: "forms/surrogate/x" })).toBeNull();
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
});
