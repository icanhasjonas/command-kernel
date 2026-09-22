import { describe, expect, it } from "bun:test";
import {
  type Ctx,
  createHmacEvidenceStore,
  createKernel,
  type Grant,
  type Kernel,
} from "@command-kernel/core";
// the one copy of the old-tag forge, shared with core's B1 regression test
import { forgeDanger } from "../../core/src/fnv-forge.test-util.js";
import { grantHeader } from "./body.js";
import { defineCommand, implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { as, gated, JSON_TYPE, post, server } from "./review.fixtures.test-util.js";
import { createWireServer } from "./server.js";

/** Wire review round 4, server side: one regression per defect (Wn). */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));
const header = grantHeader;
const call = (evidence: Grant, n = 1) => ({
  t: "cmd",
  id: "c",
  name: "danger",
  args: { n },
  evidence,
});

async function mint(wire: ReturnType<typeof createWireServer>, who: Ctx = ctx, n = 1) {
  const out = await wire.confirmCall("danger", { n }, who);
  if (!out.ok) throw new Error(out.error.code);
  return (out.result.payload as { grant: Grant }).grant;
}

describe("W1: a grant cannot be forged over the wire", () => {
  it("a grant for danger{n:1} forged into one for {n:999} is refused on both transports", async () => {
    const { wire } = server({ confirm: () => true });
    const forged = forgeDanger(await mint(wire, as("u1")), "u1", "999");
    expect((await frame(wire, call(forged, 999), as("u1"))).error.code).toBe("confirmRequired");
    const http = await post(
      wire,
      "danger",
      { body: '{"n":999}', headers: { ...JSON_TYPE, "command-evidence": header(forged) } },
      as("u1"),
    );
    expect(http?.status).toBe(409);
  });
});

describe("W2: a grant expires, and a spend hook makes it single-use", () => {
  // on the kernel's clock since core review round 7 (ctx.now is never read for it)
  it("a grant used after its 5 minutes is confirmRequired (socket and HTTP)", async () => {
    let clock = 0;
    const { wire } = server({ confirm: () => true }, () => clock);
    const grant = await mint(wire);
    clock = 5 * 60_000 + 1;
    expect((await frame(wire, call(grant))).error.code).toBe("confirmRequired");
    const headers = { ...JSON_TYPE, "command-evidence": header(grant) };
    expect((await post(wire, "danger", { body: '{"n":1}', headers }))?.status).toBe(409);
    clock = 1000;
    expect((await post(wire, "danger", { body: '{"n":1}', headers }))?.status).toBe(200);
  });

  it("with a spend hook the second use is refused", async () => {
    const spent: Array<[string, number]> = [];
    const spend = (nonce: string, expiresAt: number) => {
      if (spent.some(([n]) => n === nonce)) return false;
      spent.push([nonce, expiresAt]);
      return true;
    };
    const { wire } = server({ confirm: () => true, spend });
    const grant = await mint(wire);
    expect((await frame(wire, call(grant))).data).toEqual({ ok: true });
    expect((await frame(wire, call(grant))).error.code).toBe("confirmRequired");
    expect(spent).toEqual([[grant.nonce, grant.expiresAt ?? -1]]);
  });

  it("without one, a grant is reusable within its TTL (the README says so)", async () => {
    const { wire } = server({ confirm: () => true });
    const grant = await mint(wire);
    for (let i = 0; i < 3; i++) expect((await frame(wire, call(grant))).data).toEqual({ ok: true });
  });
});

describe("W3: isolates that share a key accept each other's grants", () => {
  const isolate = (kernel: Kernel) =>
    createWireServer({ kernel, specs: [gated], confirm: () => true });
  const kernelWith = (evidence?: ReturnType<typeof createHmacEvidenceStore>) =>
    createKernel({
      roots: [implement(gated, async () => ({ ok: true }))],
      ...(evidence && { evidence }),
    });

  it("a grant minted on one server runs on a second with the same key", async () => {
    const key = new Uint8Array(32).fill(9);
    const a = isolate(kernelWith(createHmacEvidenceStore(key)));
    const b = isolate(kernelWith(createHmacEvidenceStore(key)));
    expect((await frame(b, call(await mint(a)))).data).toEqual({ ok: true });
  });

  it("the default per-store key does not (single process only)", async () => {
    const a = isolate(kernelWith());
    const b = isolate(kernelWith());
    expect((await frame(b, call(await mint(a)))).error.code).toBe("confirmRequired");
  });
});

describe("W4: a throwing confirm policy, gate or prefill is a serverFail", () => {
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
      const { type: _t, title: _ti, ...problem } = JSON.parse(body ?? "{}");
      expect(JSON.parse(ws).error).toEqual(problem);
      expect(problem.code).toBe("serverFail");
    });
  }
});

describe("W8: a result that cannot be serialised is a serverFail", () => {
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

describe("W9, W10: declarations a server refuses at construction", () => {
  const route = { method: "GET", path: "/x" } as const;
  const make = (
    node: { id: string; effect?: "writes" | "pure"; gate?: { confirm: boolean } },
    http = true,
  ) =>
    createWireServer({ kernel: createKernel(), specs: [{ node, ...(http && { http: route }) }] });

  it("a GET route on a command that writes, declared or inferred from its gate", () => {
    expect(() => make({ id: "w", effect: "writes" })).toThrow(/\bw\b/);
    expect(() => make({ id: "g", gate: { confirm: true } })).toThrow(/\bg\b/);
    expect(() => make({ id: "r", effect: "pure" })).not.toThrow();
  });

  it("a command id outside [A-Za-z0-9._-]", () => {
    expect(() => make({ id: "a/b" }, false)).toThrow(/a\/b/);
    expect(() => make({ id: "a b" }, false)).toThrow();
    expect(() => make({ id: "thread.set_seen-2" }, false)).not.toThrow();
  });
});
