import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * Review round 6, B2: a hop is keyed by the args resolve() actually received.
 *
 * `box` prefills its id from where the caller stands. resolve() runs with the
 * prefilled id, so the children it hands out belong to THAT box. A hop keyed only
 * by the args written on the segment ({}) made a grant for box > purge approved in
 * "inbox" verify in "archive", and purge ran against the archive.
 */

const purgeOf = (box: string): CommandNode => ({
  id: "purge",
  title: "Purge",
  gate: { confirm: true },
  run: async () => ({ kind: "toast", message: `purge:${box}` }),
});

const box: CommandNode = {
  id: "box",
  title: "Box",
  args: [{ id: "id", label: "box", kind: "string" }],
  prefill: (c) => ({ id: c.location.module }),
  resolve: async (a) => [purgeOf(String(a.id))],
};

const at = (module: string): Ctx => ({
  location: { module },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
});

const PATH = [{ id: "box" }, { id: "purge" }];

describe("B2: a hop is keyed by the args resolve() received", () => {
  it("a grant approved under the inbox does not run purge in the archive", async () => {
    const k = createKernel({ roots: [box] });
    const gate = await k.command({ path: PATH, execute: true }, at("inbox"));
    if (gate.kind !== "gate") throw new Error(gate.kind);
    const evidence = k.grantFor(gate);
    const path = [{ id: "box" }, { id: "purge", evidence }];

    const elsewhere = await k.command({ path, execute: true }, at("archive"));
    expect(elsewhere.kind).toBe("gate");

    const here = await k.command({ path, execute: true }, at("inbox"));
    expect(here.kind === "result" && here.result.message).toBe("purge:inbox");
  });

  it("the prior key names the prefilled box", async () => {
    const k = createKernel({ roots: [box] });
    const gate = await k.command({ path: PATH, execute: true }, at("inbox"));
    expect(gate.kind === "gate" && gate.priorKey).toBe("box(id=inbox)");
  });
});
