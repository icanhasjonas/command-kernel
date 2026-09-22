import { describe, expect, it } from "bun:test";
import { createKernel } from "@command-kernel/core";
import { createWireClient } from "./client.js";
import { defineCommand, implement } from "./define.js";
import { ctx, getMessage } from "./fixtures.test-util.js";
import { failed } from "./harness.test-util.js";
import { fillRoute, matchRoute } from "./route.js";
import { createWireServer } from "./server.js";

/**
 * A path param of "", "." or ".." is refused: the URL parser folds "." and ".."
 * segments away, so the call would reach a DIFFERENT route (/boxes/../messages/m1
 * is /messages/m1). Every transport answers invalidArguments, so GET and POST agree.
 */

const otherGet = defineCommand<{ messageId: string }, { from: string }>()(
  {
    id: "other.get",
    title: "Another read",
    effect: "pure",
    args: [{ id: "messageId", label: "message", kind: "string", required: true }],
  },
  { http: { method: "GET", path: "/messages/:messageId" } },
);

function setup() {
  const reached: string[] = [];
  const kernel = createKernel({
    roots: [
      implement(getMessage, async () => {
        reached.push("message.get");
        return { subject: "Hello" };
      }),
      implement(otherGet, async () => {
        reached.push("other.get");
        return { from: "the other route" };
      }),
    ],
  });
  const wire = createWireServer({ kernel, specs: [getMessage, otherGet] });
  const fetched: string[] = [];
  const client = createWireClient({
    http: "/api",
    fetch: async (url, init) => {
      fetched.push(url);
      return (
        (await wire.handleHttp(new Request(`https://x${url}`, init), ctx)) ??
        new Response("", { status: 404 })
      );
    },
  });
  return { wire, client, reached, fetched };
}

const frame = async (w: ReturnType<typeof createWireServer>, args: object) =>
  JSON.parse(
    await w.handleFrame(JSON.stringify({ t: "cmd", id: "c", name: "message.get", args }), ctx),
  );

/** An HTTP answer's status and problem code. */
const answer = async (res: Response | null) => [res?.status, res ? (await res.json()).code : null];

describe("a dot or empty path param never reaches another route", () => {
  it("the client refuses '.', '..' and '' before fetching", async () => {
    for (const boxId of ["..", ".", ""]) {
      const { client, reached, fetched } = setup();
      const e = await failed(client.call(getMessage, { boxId, messageId: "m1" }));
      expect([e.code, e.retryable]).toEqual(["invalidArguments", false]);
      expect([fetched, reached]).toEqual([[], []]);
    }
  });

  it("fillRoute throws on a dot or empty param", () => {
    for (const v of ["..", ".", ""]) expect(() => fillRoute("/boxes/:b/m", { b: v })).toThrow(":b");
    expect(fillRoute("/boxes/:b/m", { b: "..." })).toBe("/boxes/.../m");
  });

  it("the server answers invalidArguments for the same args on a socket and a POST", async () => {
    const { wire, reached } = setup();
    for (const boxId of ["..", "."]) {
      const ws = await frame(wire, { boxId, messageId: "m1" });
      expect([ws.error.code, ws.error.status]).toEqual(["invalidArguments", 400]);
      const res = await wire.handleHttp(
        new Request("https://x/api/message.get", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ boxId, messageId: "m1" }),
        }),
        ctx,
      );
      expect(await answer(res)).toEqual([400, "invalidArguments"]);
    }
    expect(reached).toEqual([]);
  });

  it("an empty segment in a GET path is invalidArguments, not a shorter route", async () => {
    const { wire, reached } = setup();
    const res = await wire.handleHttp(new Request("https://x/api/boxes//messages/m1"), ctx);
    expect(await answer(res)).toEqual([400, "invalidArguments"]);
    expect(reached).toEqual([]);
  });

  it("matchRoute keeps empty segments in place and still allows one trailing slash", () => {
    expect(matchRoute("/boxes/:b/m/:m", "/boxes//m/x")).toEqual({ b: "", m: "x" });
    expect(matchRoute("/boxes/:b", "/boxes/b1/")).toEqual({ b: "b1" });
    expect(matchRoute("/boxes/:b/:c", "/boxes/b1")).toBeNull();
  });
});
