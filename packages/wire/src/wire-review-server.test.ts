import { describe, expect, it } from "bun:test";
import type { Grant } from "@command-kernel/core";
import { createWireClient } from "./client.js";
import { defineCommand } from "./define.js";
import { ctx, FakeSocket, makeServer, setSeen as setSeenSpec } from "./fixtures.test-util.js";
import { serverStatus, statusOf } from "./protocol.js";
import { JSON_TYPE, post, server } from "./review.fixtures.test-util.js";
import { createWireServer } from "./server.js";

/** Wire review rounds 1-2, server side: one regression per defect (W1..W14, D1..D12). */

describe("server", () => {
  it("W1: a client-only or unknown code thrown by run() never crashes the Response", async () => {
    const { wire } = server({ statusFor: () => 600 });
    expect((await post(wire, "throw.timeout"))?.status).toBe(500);
    expect((await post(wire, "throw.weird"))?.status).toBe(500);
  });

  it("W2: a grant travels over HTTP (header) and the socket (field); a malformed one is refused", async () => {
    const { wire } = server({ confirm: () => true });
    const first = await (await post(wire, "danger", { body: '{"n":2}' }))?.json();
    expect(first.code).toBe("confirmRequired");
    const minted = await wire.confirmCall("danger", { n: 2 }, ctx);
    if (!minted.ok) throw new Error(minted.error.code);
    const { grant } = minted.result.payload as { grant: Grant };
    const viaHttp = await post(wire, "danger", {
      body: '{"n":2}',
      headers: { ...JSON_TYPE, "command-evidence": `${grant.nonce}.${grant.sig}` },
    });
    expect(await viaHttp?.json()).toEqual({ ok: true });
    const viaWs = JSON.parse(
      await wire.handleFrame(
        JSON.stringify({ t: "cmd", id: "c", name: "danger", args: { n: 2 }, evidence: grant }),
        ctx,
      ),
    );
    expect(viaWs.data).toEqual({ ok: true });
    const junk = await post(wire, "danger", {
      headers: { ...JSON_TYPE, "command-evidence": "junk" },
    });
    expect(junk?.status).toBe(400);
  });

  it("W4: a chunked body is refused at the limit without reading it all", async () => {
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

  it("W10: a literal route beats a param route; two identical shapes throw", () => {
    const byId = defineCommand<{ id: string }, unknown>()(
      { id: "a", title: "a" },
      { http: { method: "GET", path: "/boxes/:id" } },
    );
    const fresh = defineCommand<object, unknown>()(
      { id: "b", title: "b" },
      { http: { method: "GET", path: "/boxes/new" } },
    );
    const { kernel } = server();
    expect(() => createWireServer({ kernel, specs: [byId, fresh] })).not.toThrow();
    const clash = defineCommand<{ x: string }, unknown>()(
      { id: "c", title: "c" },
      { http: { method: "GET", path: "/boxes/:x" } },
    );
    expect(() => createWireServer({ kernel, specs: [byId, clash] })).toThrow(
      "match the same paths",
    );
  });

  it("W13: the heartbeat ping is answered with pong, not an error", async () => {
    expect(await makeServer().handleFrame("ping", ctx)).toBe("pong");
  });
});

describe("both transports hand back the same thing (W3)", () => {
  const { wire } = server();
  const fetchIt = async (url: string, init?: RequestInit) =>
    (await wire.handleHttp(new Request(`https://x${url}`, init), ctx)) ??
    new Response("", { status: 404 });
  const socket = (url: string) => new FakeSocket(url, wire);

  for (const [name, want] of [
    ["say.hi", { kind: "toast", message: "hi", payload: { x: 1 } }],
    ["say.nothing", null],
  ] as const) {
    it(`${name}`, async () => {
      const c = createWireClient({
        http: "/api",
        ws: "wss://x",
        fetch: fetchIt,
        socket,
        heartbeat: false,
      });
      const overHttp = await c.callName(name);
      c.connect();
      FakeSocket.all.at(-1)?.open();
      const overWs = await c.callName(name);
      expect(overHttp).toEqual(want);
      expect(overWs).toEqual(want);
      c.close();
    });
  }
});

describe("review round 2, server", () => {
  it("D4: an oversized frame answers tooLarge and still settles the call", async () => {
    const { wire } = server({ maxBytes: 40 });
    const frame = JSON.stringify({
      t: "cmd",
      id: "c9",
      name: "say.hi",
      args: { pad: "x".repeat(200) },
    });
    const res = JSON.parse(await wire.handleFrame(frame, ctx));
    expect([res.id, res.error.code, res.error.status]).toEqual(["c9", "tooLarge", 413]);
  });

  it("D6: the server mints a grant only when the host's policy says so", async () => {
    const asked: string[] = [];
    const { wire: yes } = server({
      confirm: ({ name }) => {
        asked.push(name);
        return true;
      },
    });
    const { wire: no } = server({ confirm: () => false });
    const { wire: off } = server();
    const args = { n: 2 };
    const minted = await yes.confirmCall("danger", args, ctx);
    expect(minted.ok && (minted.result.payload as { grant: Grant }).grant.sig).toBeTruthy();
    expect(asked).toEqual(["danger"]);
    expect((await no.confirmCall("danger", args, ctx)).ok).toBe(false);
    expect((await off.confirmCall("danger", args, ctx)).ok).toBe(false);
    // and a command that is not gated cannot be "confirmed"
    expect((await yes.confirmCall("say.hi", {}, ctx)).ok).toBe(false);
  });

  it("D9: a literal segment wins at the first position that differs", async () => {
    const a = defineCommand<{ x: string }, unknown>()(
      { id: "a", title: "a" },
      { http: { method: "GET", path: "/:x/b" } },
    );
    const b = defineCommand<{ y: string }, unknown>()(
      { id: "b", title: "b" },
      { http: { method: "GET", path: "/a/:y" } },
    );
    const { wire } = server({ specs: [a, b] });
    expect(await wire.handleHttp(new Request("https://x/api/a/b"), ctx)).not.toBeNull();
  });

  it("D11: a code named like an Object member is not a status", () => {
    expect(statusOf("constructor")).toBe(400);
    expect(serverStatus("toString")).toBe(400);
  });

  it("D12: OPTIONS says what the path accepts; GET on a command path says POST", async () => {
    const { wire } = server();
    const { wire: withSpecs } = server({ specs: [setSeenSpec] });
    const options = await wire.handleHttp(
      new Request("https://x/api/say.hi", { method: "OPTIONS" }),
      ctx,
    );
    expect([options?.status, options?.headers.get("allow")]).toEqual([
      204,
      "GET, HEAD, POST, OPTIONS",
    ]);
    const get = await withSpecs.handleHttp(new Request("https://x/api/thread.setSeen"), ctx);
    expect([get?.status, get?.headers.get("allow")]).toEqual([405, "POST"]);
  });
});
