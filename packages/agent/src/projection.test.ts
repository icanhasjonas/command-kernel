import { describe, expect, it } from "bun:test";
import { type CommandNode, type Ctx, createKernel, type EntityType } from "@command-kernel/core";
import { createProjection } from "./projection.js";

const ctx = (role = "admin"): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "circle" },
  now: 0,
  frecency: {},
});

const reset: CommandNode = {
  id: "users.send_reset",
  title: "Send password reset",
  summary: "Email a user a reset link",
  gate: { roles: ["admin"], confirm: true, reason: "irreversible" },
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async (a) => ({ kind: "toast", message: `reset ${a.user}` }),
};
const usersCategory: CommandNode = {
  id: "users",
  title: "Users",
  summary: "User management",
  resolve: async () => [reset],
};
const ping: CommandNode = {
  id: "ping",
  title: "Ping",
  run: async () => ({ kind: "toast", message: "pong" }),
};

const personType: EntityType = {
  name: "person",
  search: async (q) =>
    [
      { id: "jon@wall.north", label: "Jon Snow" },
      { id: "sam@castle.black", label: "Sam Tarly" },
    ].filter((p) => p.label.toLowerCase().includes(q.toLowerCase())),
};

const kernel = createKernel({ roots: [usersCategory, ping], entities: [personType] });
const projection = createProjection(kernel, { promote: [ping] });

describe("projection — the generic tool surface", () => {
  it("advertises the 4 generic tools + promoted named tools", () => {
    const names = projection.tools.map((t) => t.name);
    expect(names).toContain("search");
    expect(names).toContain("resolve");
    expect(names).toContain("execute");
    expect(names).toContain("discover");
    expect(names).toContain("ping"); // promoted
  });

  it("search returns self-describing completions", async () => {
    const r = await projection.call("search", { query: "users" }, ctx());
    expect(r.kind).toBe("completions");
    if (r.kind === "completions") expect(r.items.some((d) => d.id === "users")).toBe(true);
  });

  it("resolve drills into a category", async () => {
    const r = await projection.call("resolve", { path: "users" }, ctx());
    expect(r.kind === "completions" && r.items.some((d) => d.id === "users.send_reset")).toBe(true);
  });

  it("execute on a gated command returns a gate — the model cannot self-approve", async () => {
    const r = await projection.call(
      "execute",
      { path: "users/users.send_reset", args: { user: "jon@wall.north" } },
      ctx(),
    );
    expect(r.kind).toBe("gate");
  });

  it("execute surfaces invalid args as needs-args (not a run)", async () => {
    const r = await projection.call(
      "execute",
      { path: "users/users.send_reset", args: { user: "not-an-email" } },
      ctx(),
    );
    expect(r.kind === "needs-args" && r.errors.map((e) => e.argId)).toEqual(["user"]);
  });

  it("a promoted named tool runs its command", async () => {
    const r = await projection.call("ping", {}, ctx());
    expect(r.kind === "result" && r.message).toBe("pong");
  });

  it("discover resolves a NL reference against the entity catalog", async () => {
    const r = await projection.call("discover", { entityType: "person", query: "jon" }, ctx());
    expect(r.kind === "entities" && r.entities[0]?.id).toBe("jon@wall.north");
  });

  it("an unknown tool is an error, not a throw", async () => {
    const r = await projection.call("nope", {}, ctx());
    expect(r.kind).toBe("error");
  });
});
