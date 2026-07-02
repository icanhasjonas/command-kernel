import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { describeNode } from "./describe.js";
import { createEntityRegistry, type EntityType } from "./entity.js";
import { toJsonSchema } from "./schema.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};

const PEOPLE = [
  { id: "jon@wall.north", label: "Jon Snow", email: "jon@wall.north" },
  { id: "arya@no.one", label: "Arya Stark", email: "" },
  { id: "sam@castle.black", label: "Sam Tarly", email: "sam@castle.black" },
];

const personType: EntityType = {
  name: "person",
  async search(query, _ctx, opts) {
    let list = PEOPLE.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()));
    if (opts?.constraint === "with-email-address") list = list.filter((p) => p.email);
    if (opts?.limit) list = list.slice(0, opts.limit);
    return list.map((p) => ({ id: p.id, label: p.label, hint: p.email }));
  },
  async get(id) {
    const p = PEOPLE.find((x) => x.id === id);
    return p ? { id: p.id, label: p.label } : null;
  },
};

const sendEmail: CommandNode = {
  id: "email.send",
  title: "Send email",
  summary: "Email a person",
  args: [
    {
      id: "to",
      label: "to",
      kind: "entity",
      required: true,
      entity: { type: "person", constraint: "with-email-address" },
    },
  ],
  run: async (a) => ({ kind: "toast", message: `sent to ${a.to}` }),
};

describe("entity registry", () => {
  it("searches a registered type", async () => {
    const reg = createEntityRegistry(personType);
    const all = await reg.search("person", "", ctx);
    expect(all.map((e) => e.id)).toEqual(["jon@wall.north", "arya@no.one", "sam@castle.black"]);
    expect((await reg.search("person", "arya", ctx)).map((e) => e.label)).toEqual(["Arya Stark"]);
  });

  it("honours a constraint (Person<'with-email-address'>)", async () => {
    const reg = createEntityRegistry(personType);
    const emailable = await reg.search("person", "", ctx, { constraint: "with-email-address" });
    expect(emailable.map((e) => e.id)).toEqual(["jon@wall.north", "sam@castle.black"]); // Arya dropped
  });

  it("get hydrates by id; unknown type is empty / null", async () => {
    const reg = createEntityRegistry(personType);
    expect((await reg.get("person", "jon@wall.north", ctx))?.label).toBe("Jon Snow");
    expect(await reg.search("ghost", "x", ctx)).toEqual([]);
    expect(await reg.get("ghost", "x", ctx)).toBeNull();
  });
});

describe("entity-typed args", () => {
  it("the entity catalog is an arg's completion source through command()", async () => {
    const kernel = createKernel({ roots: [sendEmail], entities: [personType] });
    const res = await kernel.command({ path: [{ id: "email.send" }], execute: true }, ctx);
    expect(res.kind).toBe("args");
    if (res.kind === "args") {
      const toArg = res.items.find((i) => i.kind === "arg" && i.arg.id === "to");
      expect(toArg?.kind === "arg" && toArg.options.map((o) => o.value)).toEqual([
        "jon@wall.north",
        "sam@castle.black", // constraint applied: Arya (no email) excluded
      ]);
    }
  });

  it("an agent can query the SAME catalog the palette completes from", async () => {
    const kernel = createKernel({ entities: [personType] });
    const found = await kernel.entities?.search("person", "sam", ctx);
    expect(found?.[0]?.id).toBe("sam@castle.black");
  });

  it("describeNode tells an agent the arg is an entity + its type/constraint", () => {
    const d = describeNode(sendEmail);
    const to = d.args.find((a) => a.id === "to");
    expect(to?.options).toBe("entity");
    expect(to?.entity).toEqual({ type: "person", constraint: "with-email-address" });
  });

  it("toJsonSchema describes the entity arg as an id to resolve", () => {
    const schema = toJsonSchema(sendEmail);
    expect(schema.properties.to?.type).toBe("string");
    expect(schema.properties.to?.description).toContain("person");
  });
});
