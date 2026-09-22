import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { ctx, FakeSocket, makeServer } from "./fixtures.test-util.js";
import { server } from "./harness.test-util.js";

/** One command, two transports: the same answer either way, and a socket that stays usable. */

describe("both transports hand back the same thing", () => {
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

describe("the socket side of the server", () => {
  it("an oversized frame answers tooLarge and still settles the call", async () => {
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

  it("the heartbeat ping is answered with pong, not an error", async () => {
    expect(await makeServer().handleFrame("ping", ctx)).toBe("pong");
  });
});
