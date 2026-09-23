import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { parseDeeplink, serializePath } from "./deeplink.js";
import { createMemoryEvidenceStore } from "./evidence.js";
import { missingArgs } from "./kernel.js";
import { toJsonSchema, validateArgs } from "./schema.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};

const invite: CommandNode = {
  id: "invite",
  title: "Invite people",
  args: [{ id: "to", label: "to", kind: "email", required: true, multiple: true }],
  run: async (a) => ({ kind: "toast", message: `invited ${(a.to as string[]).length}` }),
};

describe("listOf<X> - multi-value args", () => {
  it("toJsonSchema wraps a multiple arg in an array of the element schema", () => {
    expect(toJsonSchema(invite).properties.to).toEqual({
      type: "array",
      items: { type: "string", format: "email" },
    });
  });

  it("missingArgs treats an empty list as missing, a non-empty list as present", () => {
    expect(missingArgs(invite, { to: [] })).toEqual(["to"]);
    expect(missingArgs(invite, { to: ["a@b.io"] })).toEqual([]);
  });

  it("validateArgs checks every element", () => {
    expect(validateArgs(invite, { to: ["a@b.io", "nope"] }).map((e) => e.argId)).toEqual(["to"]);
    expect(validateArgs(invite, { to: ["a@b.io", "c@d.io"] })).toEqual([]);
  });

  it("command() runs with a list value", async () => {
    const kernel = createKernel({ roots: [invite] });
    const r = await kernel.command(
      { path: [{ id: "invite", args: { to: ["a@b.io", "c@d.io"] } }], execute: true },
      ctx,
    );
    expect(r.kind === "result" && r.result.message).toBe("invited 2");
  });

  it("deeplinks round-trip a list as repeated keys", () => {
    const url = serializePath([{ id: "invite", args: { to: ["a@b.io", "c@d.io"] } }]);
    expect(url).toBe("cmd/invite?to=a%40b.io&to=c%40d.io");
    expect(parseDeeplink(url)).toEqual([{ id: "invite", args: { to: ["a@b.io", "c@d.io"] } }]);
  });

  it("a grant binds the list as a SET (order-independent)", () => {
    const ev = createMemoryEvidenceStore();
    const g = ev.sign("invite", { to: ["a@b.io", "c@d.io"] }, "");
    expect(ev.verify(g, "invite", { to: ["c@d.io", "a@b.io"] }, "")).toBe(true); // reordered -> same
    expect(ev.verify(g, "invite", { to: ["a@b.io"] }, "")).toBe(false); // different set
  });
});
