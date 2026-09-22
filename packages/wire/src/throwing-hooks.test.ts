import { describe, expect, it } from "bun:test";
import { createKernel } from "@command-kernel/core";
import { implement } from "./define.js";
import { ctx, makeServer } from "./fixtures.test-util.js";
import { post, quiet, server } from "./review.fixtures.test-util.js";
import { createWireServer } from "./server.js";

/**
 * A host hook that throws (the error reporter, the status mapper) never turns an
 * answer into a rejected promise: the caller still gets a proper problem or err frame.
 */

const frame = async (w: ReturnType<typeof makeServer>, name: string) =>
  JSON.parse(await w.handleFrame(JSON.stringify({ t: "cmd", id: "c", name }), ctx));

describe("a throwing onError is swallowed", () => {
  const wire = makeServer(() => {
    throw new Error("the reporter is down");
  });

  it("HTTP still answers 500 serverFail", async () => {
    const res = await post(wire, "boom");
    expect(res?.status).toBe(500);
    expect((await res?.json())?.code).toBe("serverFail");
  });

  it("the socket still answers an err frame", async () => {
    const out = await frame(wire, "boom");
    expect([out.t, out.error.code, out.error.status]).toEqual(["err", "serverFail", 500]);
  });
});

describe("a throwing kernel onExecute does not hide a command that ran", () => {
  it("the call answers the result, not serverFail", async () => {
    const kernel = createKernel({
      roots: [implement(quiet, async () => undefined)],
      onExecute: () => {
        throw new Error("audit log is down");
      },
    });
    const wire = createWireServer({ kernel, specs: [quiet] });
    const res = await post(wire, "say.nothing");
    expect(res?.status).toBe(200);
  });
});

describe("a throwing statusFor falls back to 500", () => {
  const { wire } = server({
    statusFor: () => {
      throw new Error("the mapper is broken");
    },
  });

  it("HTTP answers a problem with the run()'s code and status 500", async () => {
    const res = await post(wire, "throw.weird");
    expect(res?.status).toBe(500);
    expect((await res?.json())?.code).toBe("weird");
  });

  it("the socket answers an err frame with status 500", async () => {
    const out = await frame(wire, "throw.weird");
    expect([out.t, out.error.code, out.error.status]).toEqual(["err", "weird", 500]);
  });
});
