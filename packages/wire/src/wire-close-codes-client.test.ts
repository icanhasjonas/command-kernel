import { describe, expect, it } from "bun:test";
import { createWireClient, type WireClientOptions } from "./client.js";
import type { CloseInfo, ConnectionStatus } from "./connection.js";
import { FakeSocket } from "./fixtures.test-util.js";

/**
 * A server that closes with an application code (4000-4999: "signed out", "not a member")
 * has said something a reconnect cannot fix. The client stops, reports "closed" with the
 * code, and a later connect() starts over.
 */

function setup(extra: Partial<WireClientOptions> = {}) {
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
    random: () => 0, // reconnect at once, so "no new socket" is a real observation
    ...extra,
  });
  const seen: [ConnectionStatus, CloseInfo | null][] = [];
  c.onStatus((s, info) => seen.push([s, info]));
  c.connect();
  made[0]?.open();
  return { c, made, seen };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("application close codes end the connection", () => {
  it("4001 from the server: no reconnect, status closed, and the code is told", async () => {
    const { c, made, seen } = setup();
    made[0]?.serverClose(4001, "your sign-in ended");
    await tick();
    expect(made).toHaveLength(1);
    expect(c.status).toBe("closed");
    expect(c.closedBy).toEqual({ code: 4001, reason: "your sign-in ended" });
    expect(seen.at(-1)).toEqual(["closed", { code: 4001, reason: "your sign-in ended" }]);
  });

  it("a late status listener learns why it closed", async () => {
    const { c, made } = setup();
    made[0]?.serverClose(4003, "not a member");
    const late: [ConnectionStatus, CloseInfo | null][] = [];
    c.onStatus((s, info) => late.push([s, info]));
    expect(late).toEqual([["closed", { code: 4003, reason: "not a member" }]]);
  });

  it("any other close still reconnects, with no close info", async () => {
    const { c, made, seen } = setup();
    made[0]?.serverClose(1006, "");
    await tick();
    expect(made).toHaveLength(2);
    expect(c.closedBy).toBeNull();
    expect(seen.map(([s]) => s)).toContain("reconnecting");
    c.close();
  });

  it("finalClose decides which codes are final", async () => {
    const { made } = setup({ finalClose: () => false });
    made[0]?.serverClose(4001, "signed out");
    await tick();
    expect(made).toHaveLength(2);
    made[1]?.close();
  });

  it("connect() after a final close starts over, and forgets the old reason", async () => {
    const { c, made } = setup();
    made[0]?.serverClose(4001, "signed out");
    c.connect();
    expect(made).toHaveLength(2);
    expect(c.closedBy).toBeNull();
    made[1]?.open();
    expect(c.status).toBe("open");
    c.close();
    expect(c.closedBy).toBeNull(); // the client closing is not the server refusing
  });
});
