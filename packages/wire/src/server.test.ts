import { describe, expect, it } from "bun:test";
import { ctx, makeServer } from "./fixtures.test-util.js";

const server = makeServer();
const post = (name: string, body: unknown) =>
  server.handleHttp(
    new Request(`https://x/api/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx,
  );
const get = (path: string) => server.handleHttp(new Request(`https://x/api${path}`), ctx);
const json = async (res: Response | null) => {
  if (!res) throw new Error("no response");
  return { status: res.status, body: await res.json(), headers: res.headers };
};

describe("HTTP: POST {base}/{command}", () => {
  it("runs the command and answers with its data", async () => {
    const r = await json(await post("thread.list", { boxId: "b1", limit: "1" }));
    expect(r).toMatchObject({ status: 200, body: { ids: ["t2"] } });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("an empty body is no args", async () => {
    expect((await json(await post("thread.list", ""))).body.code).toBe("invalidArguments");
  });

  it("names missing and invalid args as invalidArguments (400)", async () => {
    const missing = await json(await post("thread.setSeen", { boxId: "b1" }));
    expect(missing.status).toBe(400);
    expect(missing.body.missing).toEqual(["threadId", "seen"]);
    const bad = await json(
      await post("thread.setSeen", { boxId: "b1", threadId: "t", seen: "maybe" }),
    );
    expect(bad.body.errors[0].argId).toBe("seen");
  });

  it("the gate reads the args: another org's box is forbidden (403)", async () => {
    const r = await json(await post("thread.list", { boxId: "b2" }));
    expect(r).toMatchObject({ status: 403, body: { code: "forbidden" } });
    expect(r.headers.get("content-type")).toContain("application/problem+json");
  });

  it("a CommandError keeps its code, status and details", async () => {
    const r = await json(await get("/boxes/b1/messages/m9"));
    expect(r).toMatchObject({
      status: 404,
      body: { code: "notFound", details: { messageId: "m9" } },
    });
  });

  it("an unexpected throw is a 500 that never leaks the exception", async () => {
    const seen: unknown[] = [];
    const r = await json(
      await makeServer((e) => seen.push(e)).handleHttp(
        new Request("https://x/api/boom", {
          method: "POST",
          headers: { "content-type": "application/json" },
        }),
        ctx,
      ),
    );
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret");
    expect(seen).toHaveLength(1);
  });

  it("refuses unknown commands, bad JSON, non-object bodies and other methods", async () => {
    expect((await json(await post("nope", {}))).status).toBe(404);
    expect((await json(await post("thread.list", "{"))).body.code).toBe("badRequest");
    expect((await json(await post("thread.list", "[1]"))).body.code).toBe("badRequest");
    const put = await server.handleHttp(
      new Request("https://x/api/thread.list", { method: "PUT" }),
      ctx,
    );
    expect(put?.status).toBe(405);
    expect((await json(await post("%E0%A4%A", {}))).body.code).toBe("badRequest");
  });

  it("ignores paths outside its base", async () => {
    expect(await server.handleHttp(new Request("https://x/other"), ctx)).toBeNull();
    expect(await server.handleHttp(new Request("https://x/apix/thread.list"), ctx)).toBeNull();
  });
});

describe("HTTP: declared GET routes", () => {
  it("path params become args and the answer is cacheable forever", async () => {
    const r = await json(await get("/boxes/b1/messages/m1"));
    expect(r).toMatchObject({ status: 200, body: { subject: "Hello" } });
    expect(r.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  });

  it("an undeclared GET path is unknownCommand", async () => {
    expect((await json(await get("/boxes/b1"))).status).toBe(404);
  });
});

describe("WebSocket frames", () => {
  const frame = async (msg: unknown) =>
    JSON.parse(await server.handleFrame(typeof msg === "string" ? msg : JSON.stringify(msg), ctx));

  it("answers a call with ok + data, echoing the id", async () => {
    expect(
      await frame({
        t: "cmd",
        id: "c1",
        name: "thread.setSeen",
        args: { boxId: "b1", threadId: "t1", seen: true },
      }),
    ).toEqual({ t: "ok", id: "c1", kind: "data", message: "Mark seen", data: { seq: 8 } });
  });

  it("answers errors with the same WireError as HTTP", async () => {
    const res = await frame({ t: "cmd", id: "c2", name: "thread.list", args: { boxId: "b2" } });
    expect(res).toMatchObject({ t: "err", id: "c2", error: { code: "forbidden", status: 403 } });
  });

  it("rejects unreadable frames without crashing", async () => {
    for (const bad of [
      "{",
      "null",
      "7",
      JSON.stringify({ t: "cmd", name: "x" }),
      JSON.stringify({ t: "cmd", id: "c", name: "x", args: [] }),
    ]) {
      const res = await frame(bad);
      expect(res.t).toBe("err");
      expect(res.error.code).toBe("badRequest");
    }
  });

  it("encodes server pushes", () => {
    expect(JSON.parse(server.event("box.changed", { boxId: "b1", seq: 3 }))).toEqual({
      t: "evt",
      name: "box.changed",
      data: { boxId: "b1", seq: 3 },
    });
  });
});
