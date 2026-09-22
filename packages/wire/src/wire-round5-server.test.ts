import { describe, expect, it } from "bun:test";
import { CommandError, type Ctx, createKernel, type Grant } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { commandManifest } from "./docs.js";
import { ctx } from "./fixtures.test-util.js";
import { JSON_TYPE, post, server } from "./review.fixtures.test-util.js";
import { fillRoute } from "./route.js";
import { createWireServer } from "./server.js";

/** Wire review round 5, server side: one regression per defect (Wn). */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));
const get = (w: ReturnType<typeof createWireServer>, path: string, method = "GET") =>
  w.handleHttp(new Request(`https://x/api${path}`, { method }), ctx);

describe("W1: a GET route fails closed", () => {
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

  // core round 7 C1 refuses undeclared args, so a route param must be a declared arg
  it("a route param that is not an arg is refused, naming it", () => {
    const node = { id: "r", effect: "pure" as const, args: [{ id: "a" }] };
    const specs = [{ node, http: { method: "GET" as const, path: "/r/:b" } }];
    expect(() => createWireServer({ kernel: createKernel(), specs })).toThrow(/:b/);
  });
});

describe("W2: grant expiry does not trust a ctx built once per socket", () => {
  it("a grant used 10 minutes after the upgrade has expired, on either transport", async () => {
    let clock = 1_000_000;
    const { wire } = server({ confirm: () => true }, () => clock);
    const upgraded: Ctx = { ...ctx, now: 1_000_000 }; // built on upgrade, never rebuilt
    const out = await wire.confirmCall("danger", { n: 1 }, upgraded);
    if (!out.ok) throw new Error(out.error.code);
    const grant = (out.result.payload as { grant: Grant }).grant;
    const use = { t: "cmd", id: "c", name: "danger", args: { n: 1 }, evidence: grant };
    clock += 10 * 60_000;
    expect((await frame(wire, use, upgraded)).error.code).toBe("confirmRequired");
  });

  it("a fresh grant works on an old ctx", async () => {
    const { wire } = server({ confirm: () => true }, () => 10 ** 12);
    const old: Ctx = { ...ctx, now: 0 };
    const out = await wire.confirmCall("danger", { n: 1 }, old);
    if (!out.ok) throw new Error(out.error.code);
    const { grant } = out.result.payload as { grant: Grant };
    const use = { t: "cmd", id: "c", name: "danger", args: { n: 1 }, evidence: grant };
    expect((await frame(wire, use, old)).data).toEqual({ ok: true });
  });
});

describe("W3: a CommandError whose details cannot be sent", () => {
  const odd = defineCommand<{ which: string }, never>()({
    id: "odd",
    title: "Odd",
    args: [{ id: "which", label: "which", kind: "string", required: true }],
  });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const kernel = createKernel({
    roots: [
      implement(odd, async ({ which }) => {
        throw new CommandError("notFound", "gone", which === "big" ? { n: 1n } : cyclic);
      }),
    ],
  });
  const wire = createWireServer({ kernel, specs: [odd] });

  for (const which of ["big", "cycle"]) {
    it(`${which}: serverFail with no details, on HTTP and on a socket`, async () => {
      const http = await post(wire, "odd", { body: JSON.stringify({ which }) });
      const body = await http?.json();
      expect([http?.status, body?.code, body?.details]).toEqual([500, "serverFail", undefined]);
      const ws = await frame(wire, { t: "cmd", id: "c", name: "odd", args: { which } });
      expect([ws.error.code, ws.error.details]).toEqual(["serverFail", undefined]);
    });
  }
});

describe("W4: confirm checks args first, like a call", () => {
  it("missing or invalid args answer 400 invalidArguments, not 409 conflict", async () => {
    const { wire } = server({ confirm: () => true });
    for (const body of ["{}", '{"n":"x"}', '{"n":1,"extra":2}']) {
      const http = await post(wire, "danger?confirm", { body });
      expect([http?.status, (await http?.json())?.code]).toEqual([400, "invalidArguments"]);
    }
    const ws = await frame(wire, { t: "confirm", id: "c", name: "danger", args: {} });
    expect([ws.error.code, ws.error.missing]).toEqual(["invalidArguments", ["n"]]);
  });
});

describe("W6: an id of only dots is refused", () => {
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

describe("W7: an empty `multiple` list reaches run() the same on both transports", () => {
  const seen: unknown[] = [];
  const list = defineCommand<{ tags?: string[] }, null>()({
    id: "tags.list",
    title: "List by tag",
    effect: "pure",
    args: [{ id: "tags", label: "tags", kind: "string", multiple: true }],
  });
  const kernel = createKernel({
    roots: [
      implement(list, async (a) => {
        seen.push(Object.hasOwn(a, "tags"));
        return null;
      }),
    ],
  });
  const wire = createWireServer({
    kernel,
    specs: [{ ...list, http: { method: "GET", path: "/tags" } }],
  });

  it("absent over WS and over GET", async () => {
    await frame(wire, { t: "cmd", id: "c", name: "tags.list", args: { tags: [] } });
    await get(wire, fillRoute("/tags", { tags: [] }));
    expect(seen).toEqual([false, false]);
  });
});

describe("W8: every 405 says what is allowed", () => {
  for (const method of ["PUT", "DELETE", "PATCH"]) {
    it(method, async () => {
      const res = await get(server().wire, "/say.hi", method);
      expect(res?.status).toBe(405);
      expect(res?.headers.get("allow")).toBe("GET, HEAD, POST, OPTIONS");
    });
  }
});

describe("W10: a failed body is badRequest; the manifest reports the effective effect", () => {
  it("a body stream that errors answers 400 badRequest, not 413", async () => {
    const body = new ReadableStream({
      pull: (c) => c.error(new Error("connection reset")),
    });
    const req = new Request("https://x/api/say.hi", { method: "POST", headers: JSON_TYPE, body });
    const res = await server().wire.handleHttp(req, ctx);
    expect([res?.status, (await res?.json())?.code]).toEqual([400, "badRequest"]);
  });

  it("a gated command without an effect is reported as writes", () => {
    const m = commandManifest([
      { node: { id: "g", title: "G", gate: { confirm: true } } },
      { node: { id: "p", title: "P" } },
    ]);
    expect(m.commands.map((c) => [c.id, c.effect])).toEqual([
      ["g", "writes"],
      ["p", "pure"],
    ]);
  });
});
