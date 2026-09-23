import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { FakeSocket, makeServer, sleep, track, waitFor } from "./fixtures.test-util.js";
import { failed } from "./harness.test-util.js";

/** The client's socket stays up: it notices a dead one, backs off, and comes back. */

const WS = { http: "https://x/api", ws: "wss://x" };

describe("liveness", () => {
  it("a quiet socket is only dropped when a ping goes unanswered", async () => {
    const live = new Set<FakeSocket>();
    const c = createWireClient({
      ...WS,
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
      await sleep(8);
      sock?.push("pong");
    }
    expect(c.status).toBe("open");
    expect(live.size).toBe(1);
    c.close();
  });

  it("a call that times out makes the socket prove it is alive", async () => {
    const c = createWireClient({
      ...WS,
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

  it("a socket stuck connecting is closed after connectTimeoutMs and retried", async () => {
    const t = track((u) => new FakeSocket(u)); // never opens
    const c = createWireClient({
      ...WS,
      socket: t.socket,
      heartbeat: false,
      backoff: { minMs: 1, maxMs: 1 },
      random: () => 0,
      connectTimeoutMs: 20,
    });
    c.connect();
    await waitFor(() => t.made.length >= 2, 1000);
    expect(t.made[0]?.readyState).toBe(3);
    c.close();
  });
});

/** Accepts, then drops at once: a server that is up but refusing us. */
class Flapping extends FakeSocket {
  constructor(url: string) {
    super(url);
    setTimeout(() => {
      this.open();
      this.close();
    }, 0);
  }
}

describe("backoff resets only after the socket stayed open", () => {
  it("accept-then-close backs off instead of hammering", async () => {
    const t = track((u) => new Flapping(u));
    const c = createWireClient({
      ...WS,
      socket: t.socket,
      heartbeat: false,
      backoff: { minMs: 20, maxMs: 10_000 },
      random: () => 1,
    });
    c.connect();
    await sleep(300);
    c.close();
    // 20, 40, 80, 160 ms apart: at most 5 in 300 ms. Resetting on open made it every 20 ms.
    expect(t.made.length).toBeLessThanOrEqual(6);
  });

  it("a socket that stayed open past stableMs comes back at the shortest wait", async () => {
    const t = track((u) => new FakeSocket(u));
    const c = createWireClient({
      ...WS,
      socket: t.socket,
      heartbeat: false,
      backoff: { minMs: 10, maxMs: 10_000 },
      random: () => 1,
      stableMs: 20,
    });
    c.connect();
    for (let i = 0; i < 4; i++) {
      await waitFor(() => t.made.length === i + 1);
      t.made[i]?.open();
      t.made[i]?.close(); // four quick failures: the next wait would be 160 ms
    }
    await waitFor(() => t.made.length === 5);
    t.made[4]?.open();
    await sleep(40); // stable
    t.made[4]?.close();
    const closedAt = Date.now();
    await waitFor(() => t.made.length === 6, 1000);
    expect(Date.now() - closedAt).toBeLessThan(100);
    c.close();
  });
});

describe("reconnecting", () => {
  it("a socket factory that throws does not end reconnecting", async () => {
    let made = 0;
    const c = createWireClient({
      ...WS,
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

  it("after close(), connect() starts fresh (connecting, not reconnecting)", () => {
    const seen: string[] = [];
    const c = createWireClient({
      ...WS,
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
