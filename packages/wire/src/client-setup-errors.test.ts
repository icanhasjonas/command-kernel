import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { failed } from "./harness.test-util.js";

/**
 * A setup mistake is not an outage: retrying cannot fix it, so it is never reported
 * as a retryable `unavailable`. What can be caught at creation throws there.
 */

describe("a client set up wrong says so, and never as retryable", () => {
  it("a relative HTTP base with the runtime's fetch and no page to resolve it against throws at creation", () => {
    expect(() => createWireClient({ http: "/api" })).toThrow("/api");
  });

  it("an absolute base, or a relative one with the host's own fetch, is fine", () => {
    expect(() => createWireClient({ http: "https://app.example/api" })).not.toThrow();
    expect(() =>
      createWireClient({ http: "/api", fetch: async () => new Response("{}") }),
    ).not.toThrow();
  });

  it("a throwing headers() is misconfigured, not retryable, and nothing is fetched", async () => {
    let fetched = 0;
    const c = createWireClient({
      http: "/api",
      fetch: async () => {
        fetched++;
        return new Response("{}");
      },
      headers: () => {
        throw new Error("no token");
      },
    });
    const e = await failed(c.callName("x"));
    expect([e.code, e.retryable, e.status, fetched]).toEqual(["misconfigured", false, 0, 0]);
    expect(e.message).toContain("no token");
  });

  it("an async headers() that rejects is the same", async () => {
    const c = createWireClient({
      http: "/api",
      fetch: async () => new Response("{}"),
      headers: async () => {
        throw new Error("token store locked");
      },
    });
    const e = await failed(c.callName("x"));
    expect([e.code, e.retryable]).toEqual(["misconfigured", false]);
  });

  it("a network failure is still unavailable and retryable", async () => {
    const c = createWireClient({
      http: "/api",
      fetch: async () => {
        throw new TypeError("Network connection lost");
      },
    });
    const e = await failed(c.callName("x"));
    expect([e.code, e.retryable]).toEqual(["unavailable", true]);
  });
});
