import { expect, test } from "bun:test";
import { type CommandNode, type Ctx, createKernel } from "@command-kernel/core";
import { type Frame, framesKey } from "./palette-key.js";

/** K1-D4: the palette keys its ancestor frames exactly as command() keys a path. */

const ctx: Ctx = {
  location: { module: "mail" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

const purge: CommandNode = {
  id: "purge",
  title: "Purge",
  gate: { confirm: true },
  run: async () => ({ kind: "noop", message: "" }),
};
const box: CommandNode = {
  id: "box",
  title: "Box",
  args: [{ id: "id", label: "box", kind: "string" }],
  resolve: async () => [purge],
};

const under = (id: string): Frame[] => [
  { node: null, items: [box], dynamic: false, args: {} },
  { node: box, items: [purge], dynamic: false, args: { id } },
];

test("the palette's prior key is the one command() binds against", async () => {
  const k = createKernel({ roots: [box] });
  const res = await k.command(
    { path: [{ id: "box", args: { id: "inbox" } }, { id: "purge" }], execute: true },
    ctx,
  );
  if (res.kind !== "gate") throw new Error(res.kind);
  expect(framesKey(under("inbox"))).toBe(res.priorKey);
});

test("a grant minted under box(id=inbox) > purge does not verify under box(id=archive)", async () => {
  const k = createKernel({ roots: [box] });
  const grant = k.grantFor({
    node: purge,
    args: {},
    priorKey: framesKey(under("inbox")),
    principal: "u1",
  });
  const at = (id: string) =>
    k.executeNode(purge, {}, ctx, { grant, priorKey: framesKey(under(id)) });
  expect((await at("archive")).awaitingConfirm).toBe(true);
  expect((await at("inbox")).awaitingConfirm).toBe(false);
});
