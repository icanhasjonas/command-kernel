import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { WireCallError } from "./client-error.js";
import { FakeSocket, makeServer } from "./fixtures.test-util.js";
import { failed, gated } from "./review.fixtures.test-util.js";

/** Wire review round 3, client side: one regression per defect (K2-Dn). */

describe("K2-D5: the client always sends a JSON body with its content type", () => {
  it("a call with no args and a confirmation are both application/json with a body", async () => {
    const seen: Array<{ type: string | null; body: unknown }> = [];
    const c = createWireClient({
      http: "/api",
      fetch: async (_url, init) => {
        seen.push({ type: new Headers(init?.headers).get("content-type"), body: init?.body });
        return new Response('{"grant":{"nonce":"n","sig":"s"}}');
      },
    });
    await c.callName("say.hi");
    await c.confirm(gated, { n: 1 });
    expect(seen).toEqual([
      { type: "application/json", body: "{}" },
      { type: "application/json", body: '{"n":1}' },
    ]);
  });
});

/** A socket that is open but whose send() throws (a closing socket in some runtimes). */
class ThrowingSocket extends FakeSocket {
  override send(data: string) {
    this.sent.push(data);
    if (data !== "ping") throw new Error("InvalidStateError");
  }
}

describe("K2-D8: a send() that throws settles the call", () => {
  it("rejects with a WireCallError and leaves no timer behind", async () => {
    const c = createWireClient({
      http: "https://x/api",
      ws: "wss://x",
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
});

describe("K2-D9: onStatus tells a late listener where things stand", () => {
  it("emits the current status on subscribe", () => {
    const c = createWireClient({
      http: "https://x/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u),
      heartbeat: false,
    });
    const early: string[] = [];
    c.onStatus((s) => early.push(s));
    c.connect();
    FakeSocket.all.at(-1)?.open();
    const late: string[] = [];
    c.onStatus((s) => late.push(s));
    expect(early).toEqual(["idle", "connecting", "open"]);
    expect(late).toEqual(["open"]);
    c.close();
    expect(late).toEqual(["open", "closed"]);
  });

  it("an HTTP-only client is idle", () => {
    const got: string[] = [];
    createWireClient({ http: "https://x/api" }).onStatus((s) => got.push(s));
    expect(got).toEqual(["idle"]);
  });
});
