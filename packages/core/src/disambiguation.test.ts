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
