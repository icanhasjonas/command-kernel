import { describe, expect, it } from "bun:test";
import { createKernel } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { ctx, setSeen as setSeenSpec } from "./fixtures.test-util.js";
import { JSON_TYPE, post, server } from "./harness.test-util.js";
import { fillRoute } from "./route.js";
import { createWireServer } from "./server.js";

/** The HTTP transport: what a request must look like, and what each method answers. */

const request = (w: ReturnType<typeof createWireServer>, path: string, method = "GET") =>
  w.handleHttp(new Request(`https://x/api${path}`, { method }), ctx);

describe("every POST is application/json", () => {
  it("text/plain and a bodiless POST are 415 and never run", async () => {
    let runs = 0;
    const { wire } = server();
    const counted = createWireServer({
      kernel: createKernel({
        roots: [
          { id: "say.hi", title: "hi", run: async () => ({ kind: "noop", message: `${runs++}` }) },
        ],
      }),
      specs: [{ node: { id: "say.hi" } }],
    });
    for (const w of [wire, counted]) {
      const plain = await post(w, "say.hi", {
        body: "{}",
        headers: { "content-type": "text/plain" },
      });
      const bare = await w.handleHttp(new Request("https://x/api/say.hi", { method: "POST" }), ctx);
      for (const res of [plain, bare]) {
        expect(res?.status).toBe(415);
        expect((await res?.json())?.code).toBe("unsupportedMediaType");
      }
    }
    expect(runs).toBe(0);
    const charset = await post(wire, "say.hi", {
      body: "{}",
      headers: { "content-type": "Application/JSON; charset=utf-8" },
    });
    expect(charset?.status).toBe(200);
  });
});

describe("a body is read defensively", () => {
  it("a chunked body is refused at the limit without reading it all", async () => {
    const { wire } = server({ maxBytes: 10 });
    let pulled = 0;
    const body = new ReadableStream({
      pull(c) {
        pulled++;
        c.enqueue(new TextEncoder().encode("x".repeat(1024)));
        if (pulled > 100) c.close();
      },
    });
    const res = await post(wire, "say.hi", { body, duplex: "half" } as RequestInit);
    expect(res?.status).toBe(413);
    expect(pulled).toBeLessThan(5);
  });

  it("a body stream that errors answers 400 badRequest, not 413", async () => {
    const body = new ReadableStream({
      pull: (c) => c.error(new Error("connection reset")),
    });
    const req = new Request("https://x/api/say.hi", { method: "POST", headers: JSON_TYPE, body });
    const res = await server().wire.handleHttp(req, ctx);
    expect([res?.status, (await res?.json())?.code]).toEqual([400, "badRequest"]);
  });
});

describe("HEAD never has a body", () => {
  it("unknown path, command path, bad evidence", async () => {
    const { wire } = server();
    const head = (path: string, headers: Record<string, string> = {}) =>
      wire.handleHttp(new Request(`https://x/api${path}`, { method: "HEAD", headers }), ctx);
    for (const res of [
      await head("/nope"),
      await head("/say.hi"),
      await head("/nope", { "command-evidence": "junk" }),
    ]) {
      expect(res?.status).toBeGreaterThanOrEqual(400);
      expect(await res?.text()).toBe("");
    }
  });
});

describe("what each method answers", () => {
  it("OPTIONS says what the path accepts; GET on a command path says POST", async () => {
    const { wire } = server();
    const { wire: withSpecs } = server({ specs: [setSeenSpec] });
    const options = await request(wire, "/say.hi", "OPTIONS");
    expect([options?.status, options?.headers.get("allow")]).toEqual([
      204,
      "GET, HEAD, POST, OPTIONS",
    ]);
    const get = await request(withSpecs, "/thread.setSeen");
    expect([get?.status, get?.headers.get("allow")]).toEqual([405, "POST"]);
  });

  for (const method of ["PUT", "DELETE", "PATCH"]) {
    it(`every 405 says what is allowed: ${method}`, async () => {
      const res = await request(server().wire, "/say.hi", method);
      expect(res?.status).toBe(405);
      expect(res?.headers.get("allow")).toBe("GET, HEAD, POST, OPTIONS");
    });
  }
});

describe("an empty `multiple` list reaches run() the same on both transports", () => {
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
    const msg = { t: "cmd", id: "c", name: "tags.list", args: { tags: [] } };
    await wire.handleFrame(JSON.stringify(msg), ctx);
    await request(wire, fillRoute("/tags", { tags: [] }));
    expect(seen).toEqual([false, false]);
  });
});
