import { describe, expect, it } from "bun:test";
import { createWireClient } from "./client.js";
import { RESULT_KIND_HEADER } from "./protocol.js";
import { failed } from "./review.fixtures.test-util.js";

/**
 * The result-kind header says what the body IS: for `data` the payload itself, for
 * any other kind the `{ kind, message, payload }` envelope. The client holds the body
 * to that claim instead of handing back whatever came.
 */

const answering = (body: unknown, kind?: string) =>
  createWireClient({
    http: "/api",
    fetch: async () =>
      new Response(JSON.stringify(body), {
        headers: {
          "content-type": "application/json",
          ...(kind && { [RESULT_KIND_HEADER]: kind }),
        },
      }),
  });

describe("the client reads the body as the result-kind header says", () => {
  it("a data payload shaped like an envelope is still the payload", async () => {
    const lookalike = { kind: "toast", message: "not an envelope" };
    expect(await answering(lookalike, "data").callName("x")).toEqual(lookalike);
  });

  it("another kind hands back its envelope", async () => {
    const env = { kind: "toast", message: "hi", payload: { x: 1 } };
    expect(await answering(env, "toast").callName("x")).toEqual(env);
  });

  it("another kind whose body is not its envelope is badResponse", async () => {
    for (const body of [{ x: 1 }, { kind: "other", message: "m" }, null, "text"]) {
      const e = await failed(answering(body, "toast").callName("x"));
      expect([e.code, e.retryable]).toEqual(["badResponse", false]);
    }
  });

  it("no header (a server that does not send it) is data", async () => {
    expect(await answering({ a: 1 }).callName("x")).toEqual({ a: 1 });
  });
});
