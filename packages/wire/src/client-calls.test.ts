import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { WireCallError } from "./client-error.js";
import { defineCommand } from "./define.js";
import { FakeSocket, makeServer, setSeen as setSeenSpec, track } from "./fixtures.test-util.js";
import { failed, gated } from "./harness.test-util.js";

/** A client call always settles, with the answer or a WireCallError a caller can act on. */

const WS = { http: "https://x/api", ws: "wss://x" };
const httpOnly = (fetch: (u: string, i?: RequestInit) => Promise<Response>) =>
  createWireClient({ http: "/api", fetch });

describe("what a call sends", () => {
  it("a call with no args and a confirmation are both application/json with a body", async () => {
    const seen: Array<{ type: string | null; body: unknown }> = [];
    const c = httpOnly(async (_url, init) => {
      seen.push({ type: new Headers(init?.headers).get("content-type"), body: init?.body });
      return new Response('{"grant":{"nonce":"n","sig":"s"}}');
    });
    await c.callName("say.hi");
    await c.confirm(gated, { n: 1 });
    expect(seen).toEqual([
      { type: "application/json", body: "{}" },
      { type: "application/json", body: '{"n":1}' },
    ]);
  });
});

describe("a call that cannot go out", () => {
  it("an aborted call is `aborted`, not retryable, and a pre-aborted signal never fetches", async () => {
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

  it("a throwing headers() is a WireCallError, not a raw exception", async () => {
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

  it("a route that cannot be filled is invalidArguments, never retryable", async () => {
    const get = defineCommand<{ id: string }, unknown>()(
      { id: "g", title: "g", effect: "pure", args: [{ id: "id", label: "id", kind: "string" }] },
      { http: { method: "GET", path: "/g/:id" } },
    );
    const e = await failed(httpOnly(async () => new Response("{}")).call(get, { id: "" }));
    expect([e.code, e.retryable]).toEqual(["invalidArguments", false]);
  });
});

/** A socket that is open but whose send() throws (a closing socket in some runtimes). */
class ThrowingSocket extends FakeSocket {
  override send(data: string) {
    this.sent.push(data);
    if (data !== "ping") throw new Error("InvalidStateError");
  }
}

/** Answers every call with an err frame that has no `error` field. */
class Headless extends FakeSocket {
  override send(data: string) {
    this.sent.push(data);
    const { id } = JSON.parse(data) as { id: string };
    setTimeout(() => this.push(JSON.stringify({ t: "err", id })), 0);
  }
}

describe("a socket call always settles", () => {
  it("a send() that throws rejects with a WireCallError and leaves no timer behind", async () => {
    const c = createWireClient({
      ...WS,
      timeoutMs: 10,
      heartbeat: { intervalMs: 60_000, ping: "ping", pong: "pong", pongWaitMs: 60_000 },
      socket: (u) => new ThrowingSocket(u, makeServer(), false),
      random: () => 0,
    });
    c.connect();
    const sock = FakeSocket.all.at(-1);
    sock?.open();
    const e = await failed(c.callName("thread.list", { boxId: "b1" }, { via: "ws" }));
    expect(e).toBeInstanceOf(WireCallError);
    expect(e.code).toBe("disconnected");
    // a leaked timer would fire and probe the socket with a ping
    await new Promise((r) => setTimeout(r, 30));
    expect(sock?.sent).not.toContain("ping");
    c.close();
  });

  it("an err frame with no error rejects with badResponse instead of hanging", async () => {
    const t = track((u) => new Headless(u));
    const c = createWireClient({ ...WS, socket: t.socket, heartbeat: false, timeoutMs: 1000 });
    c.connect();
    t.made[0]?.open();
    const e = await failed(c.callName("say.hi", {}, { via: "ws" }));
    expect(e.code).toBe("badResponse");
    c.close();
  });

  it("a frame that is not ours never breaks the socket handler", () => {
    const c = createWireClient({ ...WS, socket: (u) => new FakeSocket(u), heartbeat: false });
    c.connect();
    const sock = FakeSocket.all.at(-1);
    sock?.open();
    for (const junk of ["null", "7", '"hi"', '{"t":"other","id":"c1"}', "{"]) {
      expect(() => sock?.push(junk)).not.toThrow();
    }
    c.close();
  });
});
