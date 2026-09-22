import { beforeEach, describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { WireCallError } from "./client-error.js";
import {
  boxChanged,
  ctx,
  FakeSocket,
  getMessage,
  listThreads,
  makeServer,
  setSeen,
} from "./fixtures.test-util.js";

const server = makeServer();
const calls: Array<{ url: string; method: string }> = [];
const fetchToServer = async (input: string, init?: RequestInit) => {
  const req = new Request(`https://x${input}`, init);
  calls.push({ url: input, method: req.method });
  return (await server.handleHttp(req, ctx)) ?? new Response("not found", { status: 404 });
};

const tick = () => new Promise((r) => setTimeout(r, 0));
/** Poll instead of sleeping a fixed time: robust under a loaded test run. */
async function waitFor(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 2));
  }
}

function client(extra: Partial<Parameters<typeof createWireClient>[0]> = {}) {
  return createWireClient({
    http: "/api",
    ws: "wss://x/ws",
    fetch: fetchToServer,
    socket: (url) => new FakeSocket(url),
    heartbeat: false,
    random: () => 0,
    ...extra,
  });
}

beforeEach(() => {
  FakeSocket.all = [];
  calls.length = 0;
});

describe("one call(), two transports", () => {
  it("goes over the socket when it is open", async () => {
    const c = client();
    c.connect();
    FakeSocket.all[0]?.open();
    expect(await c.call(setSeen, { boxId: "b1", threadId: "t1", seen: true })).toEqual({ seq: 8 });
    expect(calls).toHaveLength(0);
    expect(FakeSocket.all[0]?.sent[0]).toContain('"name":"thread.setSeen"');
  });

  it("falls back to HTTP when the socket is not open", async () => {
    const c = client();
    expect(await c.call(listThreads, { boxId: "b1" })).toEqual({ ids: ["t2", "t1"] });
    expect(calls).toEqual([{ url: "/api/thread.list", method: "POST" }]);
  });

  it("a declared GET route always goes over HTTP, so it can be cached", async () => {
    const c = client();
    c.connect();
    FakeSocket.all[0]?.open();
    expect(await c.call(getMessage, { boxId: "b1", messageId: "m1" })).toEqual({
      subject: "Hello",
    });
    expect(calls).toEqual([{ url: "/api/boxes/b1/messages/m1", method: "GET" }]);
  });

  it("errors arrive as WireCallError with the server's code on both transports", async () => {
    const c = client();
    const http = await c.call(listThreads, { boxId: "b2" }).catch((e) => e);
    c.connect();
    FakeSocket.all[0]?.open();
    const ws = await c.call(listThreads, { boxId: "b2" }).catch((e) => e);
    for (const e of [http, ws]) {
      expect(e).toBeInstanceOf(WireCallError);
      expect([e.code, e.status]).toEqual(["forbidden", 403]);
    }
  });
});

describe("a connection that fails", () => {
  it("rejects a call in flight as disconnected (retryable) when the socket drops", async () => {
    const c = client({ socket: (url) => new FakeSocket(url, makeServer(), false) });
    c.connect();
    FakeSocket.all[0]?.open();
    const p = c.call(setSeen, { boxId: "b1", threadId: "t1", seen: true }).catch((e) => e);
    FakeSocket.all[0]?.close();
    const e = await p;
    expect([e.code, e.retryable]).toEqual(["disconnected", true]);
  });

  it("times out a call nobody answers", async () => {
    const c = client({ timeoutMs: 20, socket: (url) => new FakeSocket(url, makeServer(), false) });
    c.connect();
    FakeSocket.all[0]?.open();
    const e = await c.call(setSeen, { boxId: "b1", threadId: "t1", seen: true }).catch((x) => x);
    expect(e.code).toBe("timeout");
  });

  it("reconnects after a drop and reports every status change", async () => {
    const seen: string[] = [];
    const c = client();
    c.onStatus((s) => seen.push(s));
    c.connect();
    FakeSocket.all[0]?.open();
    FakeSocket.all[0]?.close();
    await tick(); // backoff is 0 with random() = 0
    FakeSocket.all[1]?.open();
    // the listener hears the current status ("idle") at once, then every change
    expect(seen).toEqual(["idle", "connecting", "open", "reconnecting", "open"]);
    expect(FakeSocket.all).toHaveLength(2);
    c.close();
    expect(c.status).toBe("closed");
  });

  it("a heartbeat with no answer replaces the socket at once, even if close never finishes", async () => {
    const c = client({
      heartbeat: { intervalMs: 5, ping: "ping", pong: "pong" },
      // a half-open socket: close() is ignored and onclose never fires
      socket: (url) => Object.assign(new FakeSocket(url, makeServer(), false), { close() {} }),
    });
    c.connect();
    FakeSocket.all[0]?.open();
    await waitFor(() => FakeSocket.all.length > 1);
    expect(c.status).toBe("reconnecting");
    c.close();
  });

  it("an HTML answer (an auth proxy's login page) is badResponse, not a crash", async () => {
    const c = client({
      fetch: async () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    });
    const e = await c.call(listThreads, { boxId: "b1" }).catch((x) => x);
    expect(e.code).toBe("badResponse");
  });
});

describe("server pushes", () => {
  it("delivers declared events to their listeners until unsubscribed", () => {
    const c = client();
    const got: unknown[] = [];
    const off = c.on(boxChanged, (d) => got.push(d.seq));
    c.connect();
    const sock = FakeSocket.all[0];
    sock?.open();
    sock?.push(server.event("box.changed", { boxId: "b1", seq: 4 }));
    sock?.push(server.event("other", {}));
    off();
    sock?.push(server.event("box.changed", { boxId: "b1", seq: 5 }));
    expect(got).toEqual([4]);
  });
});
