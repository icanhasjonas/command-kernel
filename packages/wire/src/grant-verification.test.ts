import { describe, expect, it } from "bun:test";
import {
  type Ctx,
  createHmacEvidenceStore,
  createKernel,
  type Grant,
  type Kernel,
} from "@command-kernel/core";
// the one copy of the old-tag forge, shared with core's forged-grant test
import { forgeDanger } from "../../core/src/fnv-forge.test-util.js";
import { grantHeader } from "./body.js";
import { implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { as, gated, JSON_TYPE, post, server } from "./harness.test-util.js";
import { createWireServer } from "./server.js";

/** Presenting a grant: it travels on both transports, and only the right one runs. */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));
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

describe("a grant travels over HTTP (header) and the socket (field)", () => {
  it("both run with it; a malformed header is refused", async () => {
    const { wire } = server({ confirm: () => true });
    const first = await (await post(wire, "danger", { body: '{"n":2}' }))?.json();
    expect(first.code).toBe("confirmRequired");
    const grant = await mint(wire, ctx, 2);
    const viaHttp = await post(wire, "danger", {
      body: '{"n":2}',
      headers: { ...JSON_TYPE, "command-evidence": grantHeader(grant) },
    });
    expect(await viaHttp?.json()).toEqual({ ok: true });
    expect((await frame(wire, call(grant, 2))).data).toEqual({ ok: true });
    const junk = await post(wire, "danger", {
      headers: { ...JSON_TYPE, "command-evidence": "junk" },
    });
    expect(junk?.status).toBe(400);
  });
});

describe("a grant is not a bearer token", () => {
  const minted = async () => {
    const { wire } = server({ confirm: ({ ctx: c }) => c.user.id === "u1" });
    return { wire, grant: await mint(wire, as("u1"), 2) };
  };

  it("u2 replaying u1's grant over HTTP gets confirmRequired; u1 runs", async () => {
    const { wire, grant } = await minted();
    const use = (who: string) =>
      post(
        wire,
        "danger",
        { body: '{"n":2}', headers: { ...JSON_TYPE, "command-evidence": grantHeader(grant) } },
        as(who),
      );
    expect((await use("u2"))?.status).toBe(409);
    expect(await (await use("u1"))?.json()).toEqual({ ok: true });
  });

  it("u2 replaying u1's grant in a socket frame gets confirmRequired; u1 runs", async () => {
    const { wire, grant } = await minted();
    expect((await frame(wire, call(grant, 2), as("u2"))).error.code).toBe("confirmRequired");
    expect((await frame(wire, call(grant, 2), as("u1"))).data).toEqual({ ok: true });
  });
});

describe("a grant cannot be forged over the wire", () => {
  it("a grant for danger{n:1} forged into one for {n:999} is refused on both transports", async () => {
    const { wire } = server({ confirm: () => true });
    const forged = forgeDanger(await mint(wire, as("u1")), "u1", "999");
    expect((await frame(wire, call(forged, 999), as("u1"))).error.code).toBe("confirmRequired");
    const http = await post(
      wire,
      "danger",
      { body: '{"n":999}', headers: { ...JSON_TYPE, "command-evidence": grantHeader(forged) } },
      as("u1"),
    );
    expect(http?.status).toBe(409);
  });
});

describe("isolates that share a key accept each other's grants", () => {
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
