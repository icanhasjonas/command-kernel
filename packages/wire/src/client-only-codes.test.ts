import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { fromProblem, WireCallError } from "./client-error.js";
import { ctx, FakeSocket } from "./fixtures.test-util.js";
import { failed, post, server } from "./review.fixtures.test-util.js";

/**
 * `timeout` and `disconnected` are things the CLIENT saw (status 0): the same call may
 * simply be retried. A server never sends a client-only code, and a client never
 * trusts one that arrives with an HTTP status as retryable.
 */

describe("a server never sends a client-only code", () => {
  it("run() throwing CommandError('timeout') is a serverFail on HTTP and the socket, and is reported", async () => {
    const reported: string[] = [];
    const { wire } = server({ onError: (_e, name) => reported.push(name) });
    const res = await post(wire, "throw.timeout");
    const body = await res?.json();
    expect([res?.status, body?.code]).toEqual([500, "serverFail"]);
    const out = JSON.parse(
      await wire.handleFrame(JSON.stringify({ t: "cmd", id: "c", name: "throw.timeout" }), ctx),
    );
    expect([out.error.code, out.error.status]).toEqual(["serverFail", 500]);
    expect(reported).toEqual(["throw.timeout", "throw.timeout"]);
  });

  it("the client sees serverFail, not a retryable timeout", async () => {
    const { wire } = server();
    const c = createWireClient({
      http: "/api",
      fetch: async (url, init) =>
        (await wire.handleHttp(new Request(`https://x${url}`, init), ctx)) ??
        new Response("", { status: 404 }),
    });
    const e = await failed(c.callName("throw.timeout"));
    expect([e.code, e.status, e.retryable]).toEqual(["serverFail", 500, false]);
  });
});

describe("retryable timeout and disconnected need status 0", () => {
  it("with an HTTP status (a foreign or old server), they are not retryable", () => {
    for (const code of ["timeout", "disconnected"]) {
      expect(fromProblem({ code, message: "x" }, 500).retryable).toBe(false);
      expect(new WireCallError({ code, message: "x", status: 0 }).retryable).toBe(true);
    }
  });

  it("an err frame carrying timeout with status 500 is not retryable", async () => {
    const c = createWireClient({
      http: "https://x/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u, undefined, false),
      heartbeat: false,
    });
    c.connect();
    const sock = FakeSocket.all.at(-1);
    sock?.open();
    const call = failed(c.callName("thread.list", { boxId: "b1" }));
    const id = JSON.parse(sock?.sent.at(-1) ?? "{}").id;
    sock?.push(
      JSON.stringify({ t: "err", id, error: { code: "timeout", message: "x", status: 500 } }),
    );
    const e = await call;
    expect([e.code, e.retryable]).toEqual(["timeout", false]);
    c.close();
  });

  it("unavailable and rateLimited stay retryable whatever the status", () => {
    expect(fromProblem({ code: "unavailable" }, 503).retryable).toBe(true);
    expect(fromProblem({ code: "rateLimited" }, 429).retryable).toBe(true);
  });
});
