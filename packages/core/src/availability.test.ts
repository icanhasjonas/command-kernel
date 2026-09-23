import { describe, expect, it } from "bun:test";
import { disabledReason, nodeScopes } from "./availability.js";
import { createKernel } from "./create-kernel.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx = (facts: Ctx["facts"] = {}): Ctx => ({
  location: { module: "mail" },
  user: { id: "u1", name: "T", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
  facts,
});

let ran = 0;
const send: CommandNode = {
  id: "mail.send",
  title: "Send",
  disabled: (c) => (c.facts?.draftFilled ? undefined : "Write something to send"),
  run: async () => {
    ran++;
    return { kind: "toast", message: "sent" };
  },
};

describe("disabled - a reason, read from the ctx", () => {
  it("says why, or null when the node can run", () => {
    expect(disabledReason(send, ctx())).toBe("Write something to send");
    expect(disabledReason(send, ctx({ draftFilled: true }))).toBeNull();
    expect(disabledReason({ id: "x", title: "x" }, ctx())).toBeNull();
  });

  it("executeNode refuses a disabled node with its reason, and runs it once enabled", async () => {
    const kernel = createKernel({ roots: [send] });
    ran = 0;
    const refused = await kernel.executeNode(send, {}, ctx());
    expect(refused.result).toBeNull();
    expect(refused.verdict.allowed).toBe(false);
    expect(refused.verdict.checks).toEqual([{ label: "Write something to send", ok: false }]);
    expect(ran).toBe(0);
    const ok = await kernel.executeNode(send, {}, ctx({ draftFilled: true }));
    expect(ok.result?.message).toBe("sent");
    expect(ran).toBe(1);
  });
});

describe("nodeScopes", () => {
  it("defaults to global, and takes one scope or several", () => {
    expect(nodeScopes({ id: "a", title: "a" })).toEqual(["global"]);
    expect(nodeScopes({ id: "a", title: "a", scope: "list" })).toEqual(["list"]);
    expect(nodeScopes({ id: "a", title: "a", scope: ["list", "thread"] })).toEqual([
      "list",
      "thread",
    ]);
  });
});
