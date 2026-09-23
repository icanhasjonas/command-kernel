import { describe, expect, it } from "bun:test";
import type { Ctx, Grant } from "@command-kernel/core";
import { grantHeader } from "./body.js";
import { ctx } from "./fixtures.test-util.js";
import { JSON_TYPE, post, server } from "./harness.test-util.js";
import type { createWireServer } from "./server.js";

/** How long a grant lives: its TTL on the kernel's clock, and once only with a spend hook. */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));
const call = (evidence: Grant) => ({ t: "cmd", id: "c", name: "danger", args: { n: 1 }, evidence });

async function mint(wire: ReturnType<typeof createWireServer>, who: Ctx = ctx) {
  const out = await wire.confirmCall("danger", { n: 1 }, who);
  if (!out.ok) throw new Error(out.error.code);
  return (out.result.payload as { grant: Grant }).grant;
}

describe("a grant expires, and a spend hook makes it single-use", () => {
  // on the kernel's clock (ctx.now is never read for it)
  it("a grant used after its 5 minutes is confirmRequired (socket and HTTP)", async () => {
    let clock = 0;
    const { wire } = server({ confirm: () => true }, () => clock);
    const grant = await mint(wire);
    clock = 5 * 60_000 + 1;
    expect((await frame(wire, call(grant))).error.code).toBe("confirmRequired");
    const headers = { ...JSON_TYPE, "command-evidence": grantHeader(grant) };
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

describe("grant expiry does not trust a ctx built once per socket", () => {
  it("a grant used 10 minutes after the upgrade has expired, on either transport", async () => {
    let clock = 1_000_000;
    const { wire } = server({ confirm: () => true }, () => clock);
    const upgraded: Ctx = { ...ctx, now: 1_000_000 }; // built on upgrade, never rebuilt
    const grant = await mint(wire, upgraded);
    clock += 10 * 60_000;
    expect((await frame(wire, call(grant), upgraded)).error.code).toBe("confirmRequired");
  });

  it("a fresh grant works on an old ctx", async () => {
    const { wire } = server({ confirm: () => true }, () => 10 ** 12);
    const old: Ctx = { ...ctx, now: 0 };
    const grant = await mint(wire, old);
    expect((await frame(wire, call(grant), old)).data).toEqual({ ok: true });
  });
});
