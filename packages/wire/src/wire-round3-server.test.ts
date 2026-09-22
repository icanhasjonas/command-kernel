import { describe, expect, it } from "bun:test";
import { type Ctx, createKernel, type Grant } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { as, JSON_TYPE, post, server } from "./review.fixtures.test-util.js";
import { createWireServer } from "./server.js";

/** Wire review round 3, server side: one regression per defect (K2-Dn). */

const frame = async (w: ReturnType<typeof createWireServer>, msg: object, who: Ctx = ctx) =>
  JSON.parse(await w.handleFrame(JSON.stringify(msg), who));

const problemOf = async (res: Response | null) => {
  if (!res) throw new Error("no response");
  return res.json();
};

describe("K2-D1: confirming never runs anything", () => {
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

describe("K2-D2: a grant is not a bearer token", () => {
  const minted = async () => {
    const { wire } = server({ confirm: ({ ctx: c }) => c.user.id === "u1" });
    const out = await wire.confirmCall("danger", { n: 2 }, as("u1"));
    if (!out.ok) throw new Error(out.error.code);
    return { wire, grant: (out.result.payload as { grant: Grant }).grant };
  };

  it("u2 replaying u1's grant over HTTP gets confirmRequired; u1 runs", async () => {
    const { wire, grant } = await minted();
    const call = (who: string) =>
      post(
        wire,
        "danger",
        {
          body: '{"n":2}',
          headers: { ...JSON_TYPE, "command-evidence": `${grant.nonce}.${grant.sig}` },
        },
        as(who),
      );
    expect((await call("u2"))?.status).toBe(409);
    expect(await (await call("u1"))?.json()).toEqual({ ok: true });
  });

  it("u2 replaying u1's grant in a socket frame gets confirmRequired; u1 runs", async () => {
    const { wire, grant } = await minted();
    const msg = { t: "cmd", id: "c", name: "danger", args: { n: 2 }, evidence: grant };
    expect((await frame(wire, msg, as("u2"))).error.code).toBe("confirmRequired");
    expect((await frame(wire, msg, as("u1"))).data).toEqual({ ok: true });
  });
});

describe("K2-D3: confirmRequired never echoes the args", () => {
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

describe("K2-D5: every POST is application/json", () => {
  it("text/plain and a bodiless POST are 415 and never run", async () => {
    let runs = 0;
    const { wire } = server();
    const counted = createWireServer({
      kernel: createKernel({
        roots: [
          { id: "say.hi", title: "hi", run: async () => ({ kind: "noop", message: `${runs++}` }) },
        ],
      }),
      specs: [{ node: { id: "say.hi" } }],
    });
    for (const w of [wire, counted]) {
      const plain = await post(w, "say.hi", {
        body: "{}",
        headers: { "content-type": "text/plain" },
      });
      const bare = await w.handleHttp(new Request("https://x/api/say.hi", { method: "POST" }), ctx);
      for (const res of [plain, bare]) {
        expect(res?.status).toBe(415);
        expect((await problemOf(res)).code).toBe("unsupportedMediaType");
      }
    }
    expect(runs).toBe(0);
    const charset = await post(wire, "say.hi", {
      body: "{}",
      headers: { "content-type": "Application/JSON; charset=utf-8" },
    });
    expect(charset?.status).toBe(200);
  });
});

describe("K2-D6: specs is the allowlist", () => {
  const hidden = {
    id: "hidden",
    title: "Hidden",
    run: async () => ({ kind: "noop" as const, message: "ran" }),
  };
  const kernel = createKernel({ roots: [hidden] });
  const wire = createWireServer({ kernel, specs: [], confirm: () => true });

  it("an undeclared root node is unknownCommand (404), the same as no command, on both transports", async () => {
    const undeclared = await post(wire, "hidden", { body: "{}" });
    const missing = await post(wire, "nothing", { body: "{}" });
    expect([undeclared?.status, missing?.status]).toEqual([404, 404]);
    // word for word the same answer, only the name differs
    const named = async (res: Response | null, name: string) =>
      JSON.stringify(await problemOf(res)).replaceAll(name, "NAME");
    expect(await named(undeclared, "hidden")).toBe(await named(missing, "nothing"));
    const ws = await frame(wire, { t: "cmd", id: "c", name: "hidden" });
    expect([ws.error.code, ws.error.status]).toEqual(["unknownCommand", 404]);
    const confirm = await wire.confirmCall("hidden", {}, ctx);
    expect(confirm.ok ? 200 : confirm.error.status).toBe(404);
  });
});

describe("K2-D10: HEAD never has a body", () => {
  it("unknown path, command path, bad evidence", async () => {
    const { wire } = server();
    const head = (path: string, headers: Record<string, string> = {}) =>
      wire.handleHttp(new Request(`https://x/api${path}`, { method: "HEAD", headers }), ctx);
    for (const res of [
      await head("/nope"),
      await head("/say.hi"),
      await head("/nope", { "command-evidence": "junk" }),
    ]) {
      expect(res?.status).toBeGreaterThanOrEqual(400);
      expect(await res?.text()).toBe("");
    }
  });
});
