import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { defineCommand } from "./define.js";
import { commandManifest, renderCommandDocs } from "./docs.js";
import { FakeSocket, makeServer, setSeen as setSeenSpec, waitFor } from "./fixtures.test-util.js";
import { failed } from "./review.fixtures.test-util.js";

/** Wire review rounds 1-2, client and docs side: one regression per defect. */

describe("client", () => {
  const httpOnly = (fetch: (u: string, i?: RequestInit) => Promise<Response>) =>
    createWireClient({ http: "/api", fetch });

  it("W6: an aborted call is `aborted`, not retryable, and a pre-aborted signal never fetches", async () => {
    let fetched = 0;
    const c = httpOnly(async () => {
      fetched++;
      return new Response("{}");
    });
    const e = await failed(
      c.call(
        setSeenSpec,
        { boxId: "b", threadId: "t", seen: true },
        { signal: AbortSignal.abort() },
      ),
    );
    expect([e.code, e.retryable, fetched]).toEqual(["aborted", false, 0]);
  });

  it("W7: a throwing headers() is a WireCallError, not a raw exception", async () => {
    const c = createWireClient({
      http: "/api",
      fetch: async () => new Response("{}"),
      headers: () => {
        throw new Error("no token");
      },
    });
    const e = await failed(c.callName("x"));
    expect(e.name).toBe("WireCallError");
  });

  it("W8: a route that cannot be filled is invalidArguments, never retryable", async () => {
    const get = defineCommand<{ id: string }, unknown>()(
      { id: "g", title: "g" },
      { http: { method: "GET", path: "/g/:id" } },
    );
    const e = await failed(httpOnly(async () => new Response("{}")).call(get, { id: "" }));
    expect([e.code, e.retryable]).toEqual(["invalidArguments", false]);
  });

  it("W11: one throwing event handler does not stop the others, and is reported", () => {
    const errors: unknown[] = [];
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u),
      heartbeat: false,
      onError: (e) => errors.push(e),
    });
    const got: number[] = [];
    c.on({ name: "e", summary: "" }, () => {
      throw new Error("bad handler");
    });
    c.on({ name: "e", summary: "" }, () => got.push(1));
    c.connect();
    FakeSocket.all.at(-1)?.open();
    FakeSocket.all.at(-1)?.push('{"t":"evt","name":"e"}');
    expect([got, errors.length]).toEqual([[1], 1]);
    c.close();
  });

  it("W12: after close(), connect() starts fresh (connecting, not reconnecting)", () => {
    const seen: string[] = [];
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u),
      heartbeat: false,
      random: () => 0,
    });
    c.onStatus((s) => seen.push(s));
    c.connect();
    FakeSocket.all.at(-1)?.close(); // one failed attempt raises the backoff exponent
    c.close();
    c.connect();
    expect(seen.at(-1)).toBe("connecting");
    c.close();
  });
});

describe("docs", () => {
  it("W14: sort by code unit, the same on every machine", () => {
    const specs = ["b", "B", "a", "_"].map((id) =>
      defineCommand<object, unknown>()({ id, title: id }),
    );
    expect(commandManifest(specs).commands.map((c) => c.id)).toEqual(["B", "_", "a", "b"]);
  });

  it("D10: doc anchors are GitHub slugs", () => {
    expect(renderCommandDocs("x", [setSeenSpec])).toContain("(#threadsetseen)");
  });
});

describe("review round 2, client", () => {
  it("D1: a quiet socket is only dropped when a ping goes unanswered", async () => {
    const live = new Set<FakeSocket>();
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      heartbeat: { intervalMs: 5, ping: "ping", pong: "pong", pongWaitMs: 30 },
      socket: (u) => {
        const s = new FakeSocket(u, makeServer(), false);
        live.add(s);
        return s;
      },
      random: () => 0,
    });
    c.connect();
    const sock = FakeSocket.all.at(-1);
    sock?.open();
    // pings go out, and each is answered late but before its deadline
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 8));
      sock?.push("pong");
    }
    expect(c.status).toBe("open");
    expect(live.size).toBe(1);
    c.close();
  });

  it("D2: a call that times out makes the socket prove it is alive", async () => {
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      timeoutMs: 10,
      heartbeat: { intervalMs: 10_000, ping: "ping", pong: "pong", pongWaitMs: 20 },
      socket: (u) => new FakeSocket(u, makeServer(), false),
      random: () => 0,
    });
    c.connect();
    FakeSocket.all.at(-1)?.open();
    await failed(c.callName("thread.list", { boxId: "b1" }));
    expect(FakeSocket.all.at(-1)?.sent).toContain("ping");
    await waitFor(() => FakeSocket.all.length > 1); // no pong came: the socket is replaced
    c.close();
  });

  it("D3: a socket factory that throws does not end reconnecting", async () => {
    let made = 0;
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      heartbeat: false,
      random: () => 0,
      socket: (u) => {
        made++;
        if (made > 1 && made < 4) throw new Error("no token");
        return new FakeSocket(u);
      },
    });
    c.connect();
    FakeSocket.all.at(-1)?.close();
    await waitFor(() => made >= 4);
    FakeSocket.all.at(-1)?.open();
    expect(c.status).toBe("open");
    c.close();
  });

  it("D7: a frame that is not ours never breaks the socket handler", () => {
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u),
      heartbeat: false,
    });
    c.connect();
    const sock = FakeSocket.all.at(-1);
    sock?.open();
    for (const junk of ["null", "7", '"hi"', '{"t":"other","id":"c1"}', "{"]) {
      expect(() => sock?.push(junk)).not.toThrow();
    }
    c.close();
  });
});
