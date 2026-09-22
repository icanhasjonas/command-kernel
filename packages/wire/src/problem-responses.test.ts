import { describe, expect, it } from "bun:test";
import { ctx, makeServer } from "./fixtures.test-util.js";
import { post, server } from "./review.fixtures.test-util.js";

/**
 * HTTP answers as RFC 7807 means them: `title` names the problem TYPE and never
 * changes between occurrences, `detail` says what happened this time. A problem is
 * never cached, and OPTIONS only vouches for a path that exists.
 */

const http = (w: ReturnType<typeof makeServer>, path: string, init?: RequestInit) =>
  w.handleHttp(new Request(`https://x/api${path}`, init), ctx);

describe("problem+json: a stable title per code, the occurrence in detail", () => {
  it("the title names the code, the detail this occurrence", async () => {
    const wire = makeServer();
    const a = await (await http(wire, "/boxes/b1/messages/m2"))?.json();
    const b = await (await http(wire, "/nope"))?.json();
    expect(a.title).toBe("Not found");
    expect(a.detail).toBe("No such message");
    expect(a.message).toBe(a.detail); // kept for existing clients
    expect(b.title).toBe("Unknown command");
    expect(b.detail).toContain("/nope");
  });

  it("invalidArguments has one title whatever arg is wrong", async () => {
    const { wire } = server();
    const one = await (await post(wire, "danger", { body: "{}" }))?.json();
    const two = await (await post(wire, "danger", { body: '{"n":"x"}' }))?.json();
    expect([one.title, two.title]).toEqual(["Invalid arguments", "Invalid arguments"]);
    expect(one.detail).not.toBe(two.detail);
  });

  it("a run()'s own code gets the code as its stable title", async () => {
    const { wire } = server();
    const body = await (await post(wire, "throw.weird"))?.json();
    expect([body.code, body.title, body.detail]).toEqual(["weird", "weird", "nope"]);
  });
});

describe("a problem is never cached", () => {
  it("a failed GET on an immutable route answers no-store", async () => {
    const res = await http(makeServer(), "/boxes/b1/messages/m2");
    expect(res?.status).toBe(404);
    expect(res?.headers.get("cache-control")).toBe("no-store");
  });
});

describe("OPTIONS", () => {
  const wire = makeServer();
  const options = (path: string, headers: Record<string, string> = {}) =>
    http(wire, path, { method: "OPTIONS", headers });

  it("answers 204 for a command and for a declared route", async () => {
    expect((await options("/thread.setSeen"))?.status).toBe(204);
    expect((await options("/boxes/b1/messages/m1"))?.status).toBe(204);
  });

  it("answers 404 for a path that is neither", async () => {
    const res = await options("/nothing.here");
    expect([res?.status, (await res?.json())?.code]).toEqual([404, "unknownCommand"]);
  });

  it("never reads the evidence header (a preflight carries no grant)", async () => {
    const res = await options("/thread.setSeen", { "command-evidence": "junk" });
    expect(res?.status).toBe(204);
  });
});
