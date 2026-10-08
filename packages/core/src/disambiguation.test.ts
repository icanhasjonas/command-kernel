import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import type { EntityType } from "./entity.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};

const PEOPLE = [
  { id: "jon@wall.north", label: "Jon Snow" },
  { id: "jane@doe.io", label: "Jane Doe" },
  { id: "sam@castle.black", label: "Sam Tarly" },
];

const personType: EntityType = {
  name: "person",
  search: async (q) => PEOPLE.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())),
  get: async (id) => PEOPLE.find((p) => p.id === id) ?? null,
};

const email: CommandNode = {
  id: "email",
  title: "Email",
  args: [{ id: "to", label: "to", kind: "entity", required: true, entity: { type: "person" } }],
  run: async (a) => ({ kind: "toast", message: `to ${a.to}` }),
};

const k = createKernel({ roots: [email], entities: [personType] });
const run = (to: string) =>
  k.command({ path: [{ id: "email", args: { to } }], execute: true }, ctx);

describe("entity disambiguation (App Intents-style)", () => {
  it("passes a valid id straight through", async () => {
    const r = await run("jon@wall.north");
    expect(r.kind === "result" && r.result.message).toBe("to jon@wall.north");
  });

  it("auto-resolves a single search match to its id, then runs", async () => {
    const r = await run("sam"); // matches only Sam Tarly
    expect(r.kind === "result" && r.result.message).toBe("to sam@castle.black");
  });

  it("disambiguates when a value matches several", async () => {
    const r = await run("j"); // matches Jon AND Jane
    expect(r.kind).toBe("disambiguate");
    if (r.kind === "disambiguate") {
      expect(r.arg.id).toBe("to");
      expect(r.query).toBe("j");
      expect(r.candidates.map((c) => c.id)).toEqual(["jon@wall.north", "jane@doe.io"]);
    }
  });

  it("picking a candidate id from the disambiguation then runs", async () => {
    const r = await run("jane@doe.io"); // the id the user/agent picked
    expect(r.kind === "result" && r.result.message).toBe("to jane@doe.io");
  });
});

describe("an entity arg takes an entity, not any string (B14)", () => {
  const cc: CommandNode = {
    id: "cc",
    title: "Copy in",
    args: [{ id: "who", label: "who", kind: "entity", multiple: true, entity: { type: "person" } }],
    run: async (a) => ({ kind: "toast", message: `cc ${String(a.who)}` }),
  };
  const anyone: CommandNode = {
    id: "anyone",
    title: "Write to anyone",
    args: [{ id: "to", label: "to", kind: "entity", entity: { type: "person", open: true } }],
    run: async (a) => ({ kind: "toast", message: `to ${a.to}` }),
  };
  const k2 = createKernel({ roots: [email, cc, anyone], entities: [personType] });
  const go = (id: string, args: Record<string, string | string[]>) =>
    k2.command({ path: [{ id, args }], execute: true }, ctx);

  it("refuses a value no entity matches, at the args stage, before any run", async () => {
    const r = await go("email", { to: "nobody@nowhere.com" });
    expect(r.kind).toBe("args");
    if (r.kind === "args") {
      expect(r.errors).toEqual([
        { argId: "to", message: 'no person matches "nobody@nowhere.com"' },
      ]);
    }
  });

  it("checks every value of a multiple arg, resolving each like a single one", async () => {
    const ok = await go("cc", { who: ["jon@wall.north", "sam"] });
    expect(ok.kind === "result" && ok.result.message).toBe("cc jon@wall.north,sam@castle.black");
    const bad = await go("cc", { who: ["jon@wall.north", "nobody"] });
    expect(bad.kind === "args" && bad.errors[0]?.message).toBe('no person matches "nobody"');
    const many = await go("cc", { who: ["j"] });
    expect(many.kind === "args" && many.errors[0]?.message).toBe('"j" matches several persons');
  });

  it("an open entity arg still takes a value typed by hand", async () => {
    const r = await go("anyone", { to: "grace@navy.mil" });
    expect(r.kind === "result" && r.result.message).toBe("to grace@navy.mil");
  });
});
