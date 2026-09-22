import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import type { ConnectionStatus } from "./connection.js";
import { FakeSocket, waitFor } from "./fixtures.test-util.js";

/**
 * Events pushed while the socket was down are gone (there is no resume), so a client
 * must resync when it comes back. The status listener says when that is: an "open"
 * that follows an earlier open is `reconnected`; the first open is not.
 */

function client() {
  const made: FakeSocket[] = [];
  const c = createWireClient({
    http: "https://x/api",
    ws: "wss://x",
    socket: (u) => {
      const s = new FakeSocket(u);
      made.push(s);
      return s;
    },
    heartbeat: false,
    backoff: { minMs: 1, maxMs: 1 },
    random: () => 0,
  });
  const seen: Array<[ConnectionStatus, boolean]> = [];
  c.onStatus((s, change) => seen.push([s, change.reconnected]));
  return { c, made, seen };
}

const opens = (seen: Array<[ConnectionStatus, boolean]>) =>
  seen.filter(([s]) => s === "open").map(([, r]) => r);

describe("the status listener tells a reconnect from the first open", () => {
  it("first open is not reconnected; the open after a drop is", async () => {
    const { c, made, seen } = client();
    c.connect();
    made[0]?.open();
    made[0]?.close(); // the network dropped
    await waitFor(() => made.length === 2);
    made[1]?.open();
    expect(opens(seen)).toEqual([false, true]);
    c.close();
  });

  it("a first open after failed attempts is still the first", async () => {
    const { c, made, seen } = client();
    c.connect();
    made[0]?.close(); // never opened
    await waitFor(() => made.length === 2);
    made[1]?.open();
    expect(seen.map(([s]) => s)).toContain("reconnecting");
    expect(opens(seen)).toEqual([false]);
    c.close();
  });

  it("an open after close() and connect() is reconnected too (events were missed)", () => {
    const { c, made, seen } = client();
    c.connect();
    made[0]?.open();
    c.close();
    c.connect();
    made[1]?.open();
    expect(opens(seen)).toEqual([false, true]);
    c.close();
  });

  it("a listener added while reconnected-open learns it at once", async () => {
    const { c, made } = client();
    c.connect();
    made[0]?.open();
    made[0]?.close();
    await waitFor(() => made.length === 2);
    made[1]?.open();
    const late: Array<[ConnectionStatus, boolean]> = [];
    c.onStatus((s, change) => late.push([s, change.reconnected]));
    expect(late).toEqual([["open", true]]);
    c.close();
  });
});
