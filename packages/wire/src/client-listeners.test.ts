import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import type { ConnectionStatus } from "./connection.js";
import { defineEvent } from "./define.js";
import { FakeSocket, track, waitFor } from "./fixtures.test-util.js";

/** Status listeners and event handlers: told in order, and one that throws breaks nothing. */

const WS = { http: "https://x/api", ws: "wss://x" };

describe("onStatus tells a late listener where things stand", () => {
  it("emits the current status on subscribe", () => {
    const c = createWireClient({ ...WS, socket: (u) => new FakeSocket(u), heartbeat: false });
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

describe("a status listener that re-enters the client", () => {
  it("every other listener sees the statuses in order, and ends on the current one", () => {
    const t = track((u) => new FakeSocket(u));
    const c = createWireClient({ ...WS, socket: t.socket, heartbeat: false });
    const first: ConnectionStatus[] = [];
    const second: ConnectionStatus[] = [];
    c.onStatus((s) => {
      first.push(s);
      if (s === "open") c.close(); // re-enters: "closed" is reported while "open" is
    });
    c.onStatus((s) => second.push(s));
    c.connect();
    t.made[0]?.open();
    expect(c.status).toBe("closed");
    expect(second).toEqual(["idle", "connecting", "open", "closed"]);
    expect(first).toEqual(["idle", "connecting", "open", "closed"]);
  });
});

describe("a listener that throws breaks nothing", () => {
  it("a throwing status listener: subscribing, reconnecting and the heartbeat all carry on", async () => {
    const errors: unknown[] = [];
    const t = track((u) => new FakeSocket(u));
    const c = createWireClient({
      ...WS,
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

  it("one throwing event handler does not stop the others, and is reported", () => {
    const errors: unknown[] = [];
    const c = createWireClient({
      ...WS,
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

  it("an onError that throws too skips no handler and nothing escapes onmessage", () => {
    const t = track((u) => new FakeSocket(u));
    const c = createWireClient({
      ...WS,
      socket: t.socket,
      heartbeat: false,
      onError: () => {
        throw new Error("reporter bug");
      },
    });
    const ping = defineEvent<number>("ping.me", "a test event");
    const got: number[] = [];
    c.on(ping, () => {
      throw new Error("handler bug");
    });
    c.on(ping, (n) => got.push(n));
    c.onStatus((s) => {
      if (s === "open") throw new Error("listener bug");
    });
    c.connect();
    const sock = t.made[0];
    expect(() => sock?.open()).not.toThrow();
    expect(() => sock?.push(JSON.stringify({ t: "evt", name: "ping.me", data: 7 }))).not.toThrow();
    expect(got).toEqual([7]);
    c.close();
  });
});
