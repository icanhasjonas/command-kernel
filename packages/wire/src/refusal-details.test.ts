import { describe, expect, it } from "bun:test";
import { createKernel } from "@command-kernel/core";
import { implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { gated, JSON_TYPE, post, server } from "./harness.test-util.js";
import { EVIDENCE_HEADER } from "./protocol.js";
import { createWireServer, type WireServer, type WireServerOptions } from "./server.js";

/**
 * `refusalDetails`: a host says what the wire's OWN refusals of its command mean (here,
 * "nothing ran"), on both transports, and never for what the host's own code threw.
 */

const NOT_RUN = { ran: false };

function detailing(extra: Partial<WireServerOptions> = {}) {
  const asked: string[] = [];
  const { wire } = server({
    refusalDetails: ({ name, code }) => {
      asked.push(`${name}:${code}`);
      return NOT_RUN;
    },
    ...extra,
  });
  return { wire, asked };
}

const frame = async (w: WireServer, msg: object | string) =>
  JSON.parse(await w.handleFrame(typeof msg === "string" ? msg : JSON.stringify(msg), ctx));

const body = async (res: Response | null) => (await res?.json()) as Record<string, unknown>;

describe("the wire's own refusals carry the host's details", () => {
  it("bad args: the same details over HTTP and on a socket", async () => {
    const { wire, asked } = detailing();
    const http = await body(await post(wire, "danger", { body: "{}" }));
    const ws = await frame(wire, { t: "cmd", id: "c", name: "danger", args: {} });
    expect([http.code, http.details]).toEqual(["invalidArguments", NOT_RUN]);
    expect([ws.error.code, ws.error.details]).toEqual(["invalidArguments", NOT_RUN]);
    expect(asked).toEqual(["danger:invalidArguments", "danger:invalidArguments"]);
  });

  it("the gate's verdict (forbidden), on both transports", async () => {
    const kernel = createKernel({
      gate: () => ({ allowed: false, needsConfirm: false, checks: [] }),
      roots: [implement(gated, async () => ({ ok: true }))],
    });
    const wire = createWireServer({ kernel, specs: [gated], refusalDetails: () => NOT_RUN });
    const http = await body(await post(wire, "danger", { body: '{"n":1}' }));
    const ws = await frame(wire, { t: "cmd", id: "c", name: "danger", args: { n: 1 } });
    expect([http.code, http.details]).toEqual(["forbidden", NOT_RUN]);
    expect([ws.error.code, ws.error.details]).toEqual(["forbidden", NOT_RUN]);
  });

  it("a confirm the server does not take", async () => {
    const { wire } = detailing();
    const http = await body(await post(wire, "danger?confirm", { body: '{"n":1}' }));
    expect([http.code, http.details]).toEqual(["forbidden", NOT_RUN]);
  });

  it("an HTTP request the wire cannot read", async () => {
    const { wire, asked } = detailing({ maxBytes: 64 });
    const cases: Array<[string, RequestInit]> = [
      ["unsupportedMediaType", { headers: { "content-type": "text/plain" }, body: "{}" }],
      ["tooLarge", { body: JSON.stringify({ pad: "x".repeat(100) }) }],
      ["badRequest", { body: "{not json" }],
      ["badRequest", { body: "[1]" }],
      ["badRequest", { headers: { ...JSON_TYPE, [EVIDENCE_HEADER]: "!" }, body: "{}" }],
    ];
    for (const [code, init] of cases) {
      const res = await body(await post(wire, "say.hi", init));
      expect([res.code, res.details]).toEqual([code, NOT_RUN]);
    }
    expect(asked).toHaveLength(cases.length);
  });

  it("a GET of a command called with POST", async () => {
    const { wire } = detailing();
    const res = await wire.handleHttp(new Request("https://x/api/say.hi"), ctx);
    const got = await body(res);
    expect([res?.status, got.code, got.details]).toEqual([405, "methodNotAllowed", NOT_RUN]);
  });

  it("a socket frame the wire cannot take, oversized ones included", async () => {
    const { wire } = detailing({ maxBytes: 64 });
    const big = JSON.stringify({
      t: "cmd",
      id: "c",
      name: "say.hi",
      args: { pad: "x".repeat(100) },
    });
    const cases: Array<[string, object | string]> = [
      ["tooLarge", big],
      ["badRequest", { t: "cmd", id: "c", name: "say.hi", args: [1] }],
      ["badRequest", { t: "cmd", id: "c", name: "say.hi", evidence: 1 }],
    ];
    for (const [code, msg] of cases) {
      const ws = await frame(wire, msg);
      expect([ws.id, ws.error.code, ws.error.details]).toEqual(["c", code, NOT_RUN]);
    }
  });
});

describe("what refusalDetails is never asked about", () => {
  it("an undeclared command answers word for word as without it", async () => {
    const { wire, asked } = detailing();
    const { wire: plain } = server();
    const name = "say.nobody";
    expect(await (await post(wire, name, { body: "{}" }))?.text()).toBe(
      (await (await post(plain, name, { body: "{}" }))?.text()) ?? "",
    );
    const msg = JSON.stringify({ t: "cmd", id: "c", name, args: [1] });
    expect(await wire.handleFrame(msg, ctx)).toBe(await plain.handleFrame(msg, ctx));
    expect(asked).toEqual([]);
  });

  it("what a run() threw keeps its own answer", async () => {
    const { wire, asked } = detailing();
    const res = await body(await post(wire, "throw.weird", { body: "{}" }));
    expect([res.code, res.details]).toEqual(["weird", undefined]);
    expect(asked).toEqual([]);
  });

  it("a refusal with details of its own keeps them (confirmRequired)", async () => {
    const { wire, asked } = detailing();
    const res = await body(await post(wire, "danger", { body: '{"n":1}' }));
    expect([res.code, res.details]).toEqual([
      "confirmRequired",
      { command: "danger", title: "Danger" },
    ]);
    expect(asked).toEqual([]);
  });
});

describe("a refusalDetails that fails", () => {
  const cases: Array<[string, () => unknown]> = [
    [
      "throws",
      () => {
        throw new Error("boom");
      },
    ],
    ["answers a BigInt", () => ({ n: 1n })],
  ];
  for (const [what, refusalDetails] of cases) {
    it(`${what}: reported, and the refusal goes without details`, async () => {
      const reported: string[] = [];
      const { wire } = server({ refusalDetails, onError: (_e, name) => reported.push(name) });
      const http = await body(await post(wire, "danger", { body: "{}" }));
      const ws = await frame(wire, { t: "cmd", id: "c", name: "danger", args: {} });
      expect([http.code, http.details]).toEqual(["invalidArguments", undefined]);
      expect([ws.error.code, ws.error.details]).toEqual(["invalidArguments", undefined]);
      expect(reported).toEqual(["danger", "danger"]);
    });
  }
});

it("undefined answers no details", async () => {
  const { wire } = server({ refusalDetails: () => undefined });
  const res = await body(await post(wire, "danger", { body: "{}" }));
  expect([res.code, res.details]).toEqual(["invalidArguments", undefined]);
});
