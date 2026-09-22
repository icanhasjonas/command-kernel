import { describe, expect, it } from "bun:test";
import { type Ctx, createKernel, type Grant } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { post, server } from "./harness.test-util.js";
import { createWireServer } from "./server.js";

/** Asking for a grant: the server decides, confirming never runs anything, args come first. */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));

describe("the server mints a grant only when the host's policy says so", () => {
  it("a yes mints, a no or no policy refuses, and an ungated command cannot be confirmed", async () => {
    const asked: string[] = [];
    const { wire: yes } = server({
      confirm: ({ name }) => {
        asked.push(name);
        return true;
      },
    });
    const { wire: no } = server({ confirm: () => false });
    const { wire: off } = server();
    const args = { n: 2 };
    const minted = await yes.confirmCall("danger", args, ctx);
    expect(minted.ok && (minted.result.payload as { grant: Grant }).grant.sig).toBeTruthy();
    expect(asked).toEqual(["danger"]);
    expect((await no.confirmCall("danger", args, ctx)).ok).toBe(false);
    expect((await off.confirmCall("danger", args, ctx)).ok).toBe(false);
    expect((await yes.confirmCall("say.hi", {}, ctx)).ok).toBe(false);
  });
});

describe("confirming never runs anything", () => {
  it("an ungated command is a conflict, and run() never fires (direct and POST ?confirm)", async () => {
    let runs = 0;
    const free = defineCommand<object, { ok: boolean }>()({ id: "free", title: "Free" });
    const kernel = createKernel({
      roots: [
        implement(free, async () => {
          runs++;
          return { ok: true };
        }),
      ],
    });
    const wire = createWireServer({ kernel, specs: [free], confirm: () => true });
    const direct = await wire.confirmCall("free", {}, ctx);
    expect(direct.ok ? "ok" : direct.error.code).toBe("conflict");
    const res = await post(wire, "free?confirm", { body: "{}" });
    expect(res?.status).toBe(409);
    expect(runs).toBe(0);
  });
});

describe("confirm checks args first, like a call", () => {
  it("missing or invalid args answer 400 invalidArguments, not 409 conflict", async () => {
    const { wire } = server({ confirm: () => true });
    for (const body of ["{}", '{"n":"x"}', '{"n":1,"extra":2}']) {
      const http = await post(wire, "danger?confirm", { body });
      expect([http?.status, (await http?.json())?.code]).toEqual([400, "invalidArguments"]);
    }
    const ws = await frame(wire, { t: "confirm", id: "c", name: "danger", args: {} });
    expect([ws.error.code, ws.error.missing]).toEqual(["invalidArguments", ["n"]]);
  });
});

describe("confirmRequired never echoes the args", () => {
  it("a server-side prefill value appears nowhere in the answer", async () => {
    const secretive = defineCommand<{ n: number; token?: string }, { ok: boolean }>()({
      id: "secretive",
      title: "Secretive",
      gate: { confirm: true },
      prefill: () => ({ token: "s3cr3t-prefill" }),
      args: [
        { id: "n", label: "n", kind: "number", required: true },
        { id: "token", label: "token", kind: "string" },
      ],
    });
    const kernel = createKernel({ roots: [implement(secretive, async () => ({ ok: true }))] });
    const wire = createWireServer({ kernel, specs: [secretive] });
    const http = await post(wire, "secretive", { body: '{"n":1}' });
    const body = await http?.text();
    expect(http?.status).toBe(409);
    expect(body).toContain("confirmRequired");
    expect(body).not.toContain("s3cr3t");
    expect(JSON.parse(body ?? "{}").details).toEqual({ command: "secretive", title: "Secretive" });
    const ws = await wire.handleFrame(
      JSON.stringify({ t: "cmd", id: "c", name: "secretive", args: { n: 1 } }),
      ctx,
    );
    expect(ws).not.toContain("s3cr3t");
  });
});
