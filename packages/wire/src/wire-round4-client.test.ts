import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { FakeSocket, waitFor } from "./fixtures.test-util.js";
import { failed } from "./review.fixtures.test-util.js";

/** Wire review round 4, client side: one regression per defect (Wn). */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The sockets one client made, in order. */
function track<S extends FakeSocket>(make: (u: string) => S) {
  const made: S[] = [];
  return {
    made,
    socket: (u: string) => {
      const s = make(u);
      made.push(s);
      return s;
    },
  };
}

describe("W5: a throwing status listener breaks nothing", () => {
  it("subscribing, reconnecting and the heartbeat all carry on", async () => {
    const errors: unknown[] = [];
    const t = track((u) => new FakeSocket(u));
    const c = createWireClient({
      http: "https://x/api",
      ws: "wss://x",
      socket: t.socket,
      heartbeat: { intervalMs: 5, ping: "ping", pong: "pong", pongWaitMs: 60_000 },
      backoff: { minMs: 1, maxMs: 1 },
      random: () => 0,
      onError: (e) => errors.push(e),
    });
    c.onStatus(() => {
      throw new Error("listener bug");
    });
    c.connect();
    t.made[0]?.open();
    await waitFor(() => (t.made[0]?.sent ?? []).includes("ping"));
    t.made[0]?.close();
    await waitFor(() => t.made.length === 2);
    expect(errors.length).toBeGreaterThan(0);
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

describe("W6: backoff resets only after the socket stayed open", () => {
  it("accept-then-close backs off instead of hammering", async () => {
    const t = track((u) => new Flapping(u));
    const c = createWireClient({
      http: "https://x/api",
      ws: "wss://x",
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
      http: "https://x/api",
      ws: "wss://x",
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

describe("W7: a socket stuck connecting is given up on", () => {
  it("closes after connectTimeoutMs and retries", async () => {
    const t = track((u) => new FakeSocket(u)); // never opens
    const c = createWireClient({
      http: "https://x/api",
      ws: "wss://x",
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

/** Answers every call with an err frame that has no `error` field. */
class Headless extends FakeSocket {
  override send(data: string) {
    this.sent.push(data);
    const { id } = JSON.parse(data) as { id: string };
    setTimeout(() => this.push(JSON.stringify({ t: "err", id })), 0);
  }
}

describe("W11: an err frame with no error settles its call", () => {
  it("rejects with badResponse instead of hanging", async () => {
    const t = track((u) => new Headless(u));
    const c = createWireClient({
      http: "https://x/api",
      ws: "wss://x",
      socket: t.socket,
      heartbeat: false,
      timeoutMs: 1000,
    });
    c.connect();
    t.made[0]?.open();
    const e = await failed(c.callName("say.hi", {}, { via: "ws" }));
    expect(e.code).toBe("badResponse");
    c.close();
  });
});
