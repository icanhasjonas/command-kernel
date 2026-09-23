import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * THE ARG CONTRACT IS THE KERNEL'S - regression.
 *
 * `executeNode` is a public verb; the palette calls it directly rather than
 * going through `command()`. It used to validate the values that were PRESENT
 * but never check that the required ones were there at all, so a driver that
 * forgot a required arg (a positional one the palette's arg flow skips) ran the
 * command with an empty bag. Completeness is enforced here now, next to
 * validity, so no driver can under-fill its way past it.
 */

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};

function search(onRun: (v: unknown) => void): CommandNode {
  return {
    id: "users.search",
    title: "Find a user",
    args: [{ id: "q", label: "Query", kind: "string", required: true, positional: true }],
    run: async (a) => {
      onRun(a);
      return { kind: "toast", message: "ran" };
    },
  };
}

describe("executeNode enforces required args", () => {
  it("refuses to run with a required arg missing", async () => {
    let ran = false;
    const node = search(() => {
      ran = true;
    });
    const k = createKernel({ roots: [node] });
    const out = await k.executeNode(node, {}, ctx);

    expect(ran).toBe(false);
    expect(out.result).toBeNull();
    expect(out.missing).toEqual(["q"]);
    expect(out.verdict.allowed).toBe(false);
    expect(out.verdict.checks[0]?.label).toBe("Query is required");
  });

  it("a blank string is not a value", async () => {
    const node = search(() => {});
    const k = createKernel({ roots: [node] });
    const out = await k.executeNode(node, { q: "   " }, ctx);
    expect(out.missing).toEqual(["q"]);
  });

  it("runs once the required arg is filled", async () => {
    let seen: unknown = null;
    const node = search((v) => {
      seen = v;
    });
    const k = createKernel({ roots: [node] });
    const out = await k.executeNode(node, { q: "jon" }, ctx);
    expect(out.missing).toEqual([]);
    expect(out.result?.message).toBe("ran");
    expect(seen).toEqual({ q: "jon" });
  });

  it("completeness is checked BEFORE the gate - a missing arg never asks for approval", async () => {
    const node: CommandNode = {
      id: "danger",
      title: "Danger",
      gate: { confirm: true },
      args: [{ id: "target", label: "Target", kind: "string", required: true }],
      run: async () => ({ kind: "toast", message: "boom" }),
    };
    const k = createKernel({ roots: [node] });
    const out = await k.executeNode(node, {}, ctx);
    expect(out.awaitingConfirm).toBe(false);
    expect(out.missing).toEqual(["target"]);
  });
});
