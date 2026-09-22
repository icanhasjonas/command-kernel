import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import type { ConnectionStatus } from "./connection.js";
import { defineEvent } from "./define.js";
import { FakeSocket } from "./fixtures.test-util.js";

/** Wire review round 5, client side: one regression per defect (Wn). */

describe("W5: a status listener that re-enters the client", () => {
  it("every other listener sees the statuses in order, and ends on the current one", () => {
    const made: FakeSocket[] = [];
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => {
        const s = new FakeSocket(u);
        made.push(s);
        return s;
      },
      heartbeat: false,
    });
    const first: ConnectionStatus[] = [];
    const second: ConnectionStatus[] = [];
    c.onStatus((s) => {
      first.push(s);
      if (s === "open") c.close(); // re-enters: "closed" is reported while "open" is
    });
    c.onStatus((s) => second.push(s));
    c.connect();
    made[0]?.open();
    expect(c.status).toBe("closed");
    expect(second).toEqual(["idle", "connecting", "open", "closed"]);
    expect(first).toEqual(["idle", "connecting", "open", "closed"]);
  });
});

describe("W9: an onError that throws skips no handler", () => {
  it("the next event handler still runs and nothing escapes onmessage", () => {
    let sock: FakeSocket | undefined;
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => {
        sock = new FakeSocket(u);
        return sock;
      },
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
    expect(() => sock?.open()).not.toThrow();
    expect(() => sock?.push(JSON.stringify({ t: "evt", name: "ping.me", data: 7 }))).not.toThrow();
    expect(got).toEqual([7]);
    c.close();
  });
});
