import { describe, expect, it } from "bun:test";
import { CommandError, type Ctx, createKernel } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { gated, post, server } from "./harness.test-util.js";
import { serverStatus, statusOf } from "./protocol.js";
import { createWireServer } from "./server.js";

/** Whatever goes wrong on the server, the caller gets a proper answer and never the internals. */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));

describe("a code the server cannot map never crashes the Response", () => {
  it("a client-only or unknown code thrown by run() answers 500", async () => {
    const { wire } = server({ statusFor: () => 600 });
    expect((await post(wire, "throw.timeout"))?.status).toBe(500);
    expect((await post(wire, "throw.weird"))?.status).toBe(500);
  });

  it("a code named like an Object member is not a status", () => {
    expect(statusOf("constructor")).toBe(400);
    expect(serverStatus("toString")).toBe(400);
  });
});

describe("a throwing confirm policy, gate or prefill is a serverFail", () => {
  const SECRET = "db password=hunter2";
  const boom = () => {
    throw new Error(SECRET);
  };
  const cases: Array<[string, () => ReturnType<typeof createWireServer>]> = [
    ["confirm policy", () => server({ confirm: boom }).wire],
    [
      "gate",
      () => {
        const kernel = createKernel({
          gate: boom,
          roots: [implement(gated, async () => ({ ok: true }))],
        });
        return createWireServer({ kernel, specs: [gated], confirm: () => true });
      },
    ],
    [
      "prefill",
      () => {
        const node = { ...implement(gated, async () => ({ ok: true })), prefill: boom };
        return createWireServer({
          kernel: createKernel({ roots: [node] }),
          specs: [gated],
          confirm: () => true,
        });
      },
    ],
  ];
  for (const [name, make] of cases) {
    it(`${name}: 500 over HTTP, the same error on a socket, no exception text`, async () => {
      const wire = make();
      const http = await post(wire, "danger?confirm", { body: '{"n":1}' });
      const body = await http?.text();
      expect(http?.status).toBe(500);
      expect(body).not.toContain("hunter2");
      const ws = await wire.handleFrame(
        JSON.stringify({ t: "confirm", id: "c", name: "danger", args: { n: 1 } }),
        ctx,
      );
      expect(ws).not.toContain("hunter2");
      // type, title and detail are RFC 7807's HTTP-only fields; the rest is the WireError
      const { type: _t, title: _ti, detail: _d, ...problem } = JSON.parse(body ?? "{}");
      expect(JSON.parse(ws).error).toEqual(problem);
      expect(problem.code).toBe("serverFail");
    });
  }
});

describe("a result that cannot be serialised is a serverFail", () => {
  const odd = defineCommand<{ which: string }, unknown>()({
    id: "odd",
    title: "Odd",
    args: [{ id: "which", label: "which", kind: "string", required: true }],
  });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const kernel = createKernel({
    roots: [implement(odd, async ({ which }) => (which === "big" ? { n: 1n } : cyclic))],
  });
  const wire = createWireServer({ kernel, specs: [odd] });

  for (const which of ["big", "cycle"]) {
    it(`${which}: 500 over HTTP and an err frame on a socket`, async () => {
      const http = await post(wire, "odd", { body: JSON.stringify({ which }) });
      const body = await http?.json();
      expect([http?.status, body?.code]).toEqual([500, "serverFail"]);
      const ws = await frame(wire, { t: "cmd", id: "c", name: "odd", args: { which } });
      expect([ws.t, ws.error.code]).toEqual(["err", "serverFail"]);
    });
  }
});

describe("a CommandError whose details cannot be sent", () => {
  const odd = defineCommand<{ which: string }, never>()({
    id: "odd",
    title: "Odd",
    args: [{ id: "which", label: "which", kind: "string", required: true }],
  });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const kernel = createKernel({
    roots: [
      implement(odd, async ({ which }) => {
        throw new CommandError("notFound", "gone", which === "big" ? { n: 1n } : cyclic);
      }),
    ],
  });
  const wire = createWireServer({ kernel, specs: [odd] });

  for (const which of ["big", "cycle"]) {
    it(`${which}: serverFail with no details, on HTTP and on a socket`, async () => {
      const http = await post(wire, "odd", { body: JSON.stringify({ which }) });
      const body = await http?.json();
      expect([http?.status, body?.code, body?.details]).toEqual([500, "serverFail", undefined]);
      const ws = await frame(wire, { t: "cmd", id: "c", name: "odd", args: { which } });
      expect([ws.error.code, ws.error.details]).toEqual(["serverFail", undefined]);
    });
  }
});
