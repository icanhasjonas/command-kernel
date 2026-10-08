import { expect, it } from "bun:test";
import { type Ctx, createKernel } from "@command-kernel/core";
import { tap } from "./tap";

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "x" },
  now: 0,
  frecency: {},
};

/** The page's kernel spends a grant once, as the lab's server does: one approval, one run. */
it("a grant runs once through any tap; the second use owes the approval again", async () => {
  let runs = 0;
  const kernel = createKernel({
    roots: [
      {
        id: "reset",
        title: "Reset",
        gate: { confirm: true },
        run: async () => {
          runs += 1;
          return { kind: "toast", message: "done" };
        },
      },
    ],
  });
  const lab = tap(kernel, "gate-lab");
  const owed = await lab.command({ path: [{ id: "reset" }], execute: true }, ctx);
  if (owed.kind !== "gate") throw new Error(`expected a gate, got ${owed.kind}`);
  const grant = lab.grantFor(owed);
  const path = [{ id: "reset", evidence: grant }];

  expect((await lab.command({ path, execute: true }, ctx)).kind).toBe("result");
  // a different driver, the same kernel: still spent
  expect((await tap(kernel, "palette").command({ path, execute: true }, ctx)).kind).toBe("gate");
  expect(runs).toBe(1);
});
