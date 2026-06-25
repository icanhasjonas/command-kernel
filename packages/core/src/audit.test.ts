import { describe, expect, it } from "bun:test";
import { type CommandRecord, replay, toRecord } from "./audit";
import { createKernel } from "./create-kernel";
import type { CommandNode, Ctx } from "./types";

const ctx = (role = "admin"): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "circle" },
  now: 0,
  frecency: {},
});

const ping: CommandNode = {
  id: "ping",
  title: "Ping",
  args: [{ id: "msg", label: "msg", kind: "string" }],
  run: async (a) => ({ kind: "toast", message: `pong ${a.msg ?? ""}`.trim() }),
};
const reset: CommandNode = {
  id: "reset",
  title: "Reset",
  gate: { roles: ["admin"], confirm: true },
  run: async () => ({ kind: "toast", message: "reset" }),
};

describe("toRecord — serializable, evidence-free", () => {
  it("strips evidence and keeps id + args + role", () => {
    const rec = toRecord(
      {
        path: [{ id: "reset", args: { user: "a@b.io" }, evidence: { nonce: "n", sig: "s" } }],
        role: "admin",
      },
      ctx(),
    );
    expect(rec).toEqual({ path: [{ id: "reset", args: { user: "a@b.io" } }], role: "admin" });
  });

  it("defaults role to the ctx user", () => {
    expect(toRecord({ path: [{ id: "ping" }] }, ctx("advisor")).role).toBe("advisor");
  });
});

describe("onExecute hook", () => {
  it("fires once per successful run with the record", async () => {
    const log: CommandRecord[] = [];
    const kernel = createKernel({ roots: [ping], onExecute: (rec) => log.push(rec) });
    await kernel.command({ path: [{ id: "ping", args: { msg: "hi" } }], execute: true }, ctx());
    expect(log).toEqual([{ path: [{ id: "ping", args: { msg: "hi" } }], role: "admin" }]);
  });

  it("does NOT fire when the call is gated (no result)", async () => {
    const log: CommandRecord[] = [];
    const kernel = createKernel({ roots: [reset], onExecute: (rec) => log.push(rec) });
    await kernel.command({ path: [{ id: "reset" }], execute: true }, ctx());
    expect(log).toEqual([]);
  });
});

describe("replay", () => {
  it("re-runs a pure command straight through", async () => {
    const kernel = createKernel({ roots: [ping] });
    const res = await replay(kernel, { path: [{ id: "ping", args: { msg: "again" } }] }, ctx());
    expect(res.kind === "result" && res.result.message).toBe("pong again");
  });

  it("re-prompts a gated command (no smuggled grant)", async () => {
    const kernel = createKernel({ roots: [reset] });
    const res = await replay(kernel, { path: [{ id: "reset" }], role: "admin" }, ctx());
    expect(res.kind).toBe("gate");
  });
});
