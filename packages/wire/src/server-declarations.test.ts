import { describe, expect, it } from "bun:test";
import { type Ctx, createKernel } from "@command-kernel/core";
import { defineCommand } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { post, server } from "./harness.test-util.js";
import { createWireServer } from "./server.js";

/** What a server serves: the declared commands only, and declarations it can serve safely. */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));

describe("specs is the allowlist", () => {
  const hidden = {
    id: "hidden",
    title: "Hidden",
    run: async () => ({ kind: "noop" as const, message: "ran" }),
  };
  const kernel = createKernel({ roots: [hidden] });
  const wire = createWireServer({ kernel, specs: [], confirm: () => true });

  it("an undeclared root node is unknownCommand (404), the same as no command, on both transports", async () => {
    const undeclared = await post(wire, "hidden", { body: "{}" });
    const missing = await post(wire, "nothing", { body: "{}" });
    expect([undeclared?.status, missing?.status]).toEqual([404, 404]);
    // word for word the same answer, only the name differs
    const named = async (res: Response | null, name: string) =>
      JSON.stringify(await res?.json()).replaceAll(name, "NAME");
    expect(await named(undeclared, "hidden")).toBe(await named(missing, "nothing"));
    const ws = await frame(wire, { t: "cmd", id: "c", name: "hidden" });
    expect([ws.error.code, ws.error.status]).toEqual(["unknownCommand", 404]);
    const confirm = await wire.confirmCall("hidden", {}, ctx);
    expect(confirm.ok ? 200 : confirm.error.status).toBe(404);
  });
});

describe("a GET route fails closed", () => {
  // the README's own setSeen: no effect, no gate, so nothing said it writes
  const setSeen = defineCommand<{ threadId: string }, { seq: number }>()({
    id: "thread.setSeen",
    title: "Mark a thread seen",
    args: [{ id: "threadId", label: "thread", kind: "string", required: true }],
  });
  const route = { method: "GET", path: "/threads/:threadId/seen" } as const;
  const make = (effect?: "pure" | "writes") =>
    createWireServer({
      kernel: createKernel(),
      specs: [{ node: { ...setSeen.node, ...(effect && { effect }) }, http: route }],
    });

  it("a GET route without effect: 'pure' is refused, naming the command", () => {
    expect(() => make()).toThrow(/thread\.setSeen/);
    expect(() => make("writes")).toThrow(/thread\.setSeen/);
    expect(() => make("pure")).not.toThrow();
  });

  // core refuses undeclared args, so a route param must be a declared arg
  it("a route param that is not an arg is refused, naming it", () => {
    const node = { id: "r", effect: "pure" as const, args: [{ id: "a" }] };
    const specs = [{ node, http: { method: "GET" as const, path: "/r/:b" } }];
    expect(() => createWireServer({ kernel: createKernel(), specs })).toThrow(/:b/);
  });
});

describe("declarations a server refuses at construction", () => {
  const route = { method: "GET", path: "/x" } as const;
  const make = (
    node: { id: string; effect?: "writes" | "pure"; gate?: { confirm: boolean } },
    http = true,
  ) =>
    createWireServer({ kernel: createKernel(), specs: [{ node, ...(http && { http: route }) }] });

  it("a GET route on a command that writes, declared or inferred from its gate", () => {
    expect(() => make({ id: "w", effect: "writes" })).toThrow(/\bw\b/);
    expect(() => make({ id: "g", gate: { confirm: true } })).toThrow(/\bg\b/);
    expect(() => make({ id: "r", effect: "pure" })).not.toThrow();
  });

  it("a command id outside [A-Za-z0-9._-]", () => {
    expect(() => make({ id: "a/b" }, false)).toThrow(/a\/b/);
    expect(() => make({ id: "a b" }, false)).toThrow();
    expect(() => make({ id: "thread.set_seen-2" }, false)).not.toThrow();
  });
});

describe("an id of only dots is refused", () => {
  for (const id of [".", "..", "..."]) {
    it(`"${id}"`, () => {
      expect(() =>
        createWireServer({ kernel: createKernel(), specs: [{ node: { id } }] }),
      ).toThrow();
    });
  }
  it("a dot inside or at the start of an id is fine", () => {
    const specs = [{ node: { id: "a.b" } }, { node: { id: ".a" } }];
    expect(() => createWireServer({ kernel: createKernel(), specs })).not.toThrow();
  });
});

describe("route order", () => {
  it("a literal route beats a param route; two identical shapes throw", () => {
    const byId = defineCommand<{ id: string }, unknown>()(
      { id: "a", title: "a", effect: "pure", args: [{ id: "id", label: "id", kind: "string" }] },
      { http: { method: "GET", path: "/boxes/:id" } },
    );
    const fresh = defineCommand<object, unknown>()(
      { id: "b", title: "b", effect: "pure" },
      { http: { method: "GET", path: "/boxes/new" } },
    );
    const { kernel } = server();
    expect(() => createWireServer({ kernel, specs: [byId, fresh] })).not.toThrow();
    const clash = defineCommand<{ x: string }, unknown>()(
      { id: "c", title: "c", effect: "pure", args: [{ id: "x", label: "x", kind: "string" }] },
      { http: { method: "GET", path: "/boxes/:x" } },
    );
    expect(() => createWireServer({ kernel, specs: [byId, clash] })).toThrow(
      "match the same paths",
    );
  });

  it("a literal segment wins at the first position that differs", async () => {
    const a = defineCommand<{ x: string }, unknown>()(
      { id: "a", title: "a", effect: "pure", args: [{ id: "x", label: "x", kind: "string" }] },
      { http: { method: "GET", path: "/:x/b" } },
    );
    const b = defineCommand<{ y: string }, unknown>()(
      { id: "b", title: "b", effect: "pure", args: [{ id: "y", label: "y", kind: "string" }] },
      { http: { method: "GET", path: "/a/:y" } },
    );
    const { wire } = server({ specs: [a, b] });
    expect(await wire.handleHttp(new Request("https://x/api/a/b"), ctx)).not.toBeNull();
  });
});
