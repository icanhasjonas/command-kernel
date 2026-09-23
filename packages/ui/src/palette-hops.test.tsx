// happy-dom must be installed BEFORE @testing-library/react evaluates (see dom-setup.ts)
import "../../../test/dom-setup.js";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { CommandNode, Ctx } from "@command-kernel/core";
import { createKernel } from "@command-kernel/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { registerDom, unregisterDom } from "../../../test/dom-setup.js";
import { framesKey } from "./palette-key.js";
import { usePalette } from "./usePalette.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// one process runs every test file: another DOM file may already have unregistered
beforeAll(() => registerDom());
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 40));
});
afterAll(() => unregisterDom());

/**
 * Review round 6, B2, the palette half: a drilled frame is keyed by the args its
 * children were resolved with, prefill included, exactly as command() keys the hop.
 */

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
  prefill: (c) => ({ id: c.location.module }),
  resolve: async () => [purge],
};

const at = (module: string): Ctx => ({
  location: { module },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
});

async function drilledKey(module: string): Promise<string> {
  const kernel = createKernel({ roots: [box] });
  const hooks = {
    kernel,
    ctx: at(module),
    roots: [box],
    open: true,
    onResult: () => {},
    onExecuted: () => {},
    onClose: () => {},
  };
  const view = renderHook(() => usePalette(hooks));
  await act(async () => {
    await view.result.current.drill(box);
  });
  return framesKey(view.result.current.frames);
}

test("the palette keys a prefilled hop as command() does", async () => {
  const k = createKernel({ roots: [box] });
  const res = await k.command(
    { path: [{ id: "box" }, { id: "purge" }], execute: true },
    at("inbox"),
  );
  if (res.kind !== "gate") throw new Error(res.kind);
  expect(await drilledKey("inbox")).toBe(res.priorKey);
});

test("the same drill in another box keys differently", async () => {
  expect(await drilledKey("inbox")).not.toBe(await drilledKey("archive"));
});
