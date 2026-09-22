import { describe, expect, it } from "bun:test";
import { createKernel } from "./create-kernel.js";
import type { CommandNode, Ctx } from "./types.js";

/**
 * `onExecute` fires AFTER the command ran. A hook that throws (or rejects) cannot
 * un-run it, so the caller still gets the result: the hook's failure is swallowed.
 */

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};

function counted() {
  const ran: string[] = [];
  const node: CommandNode = {
    id: "send",
    title: "Send",
    run: async () => {
      ran.push("send");
      return { kind: "toast", message: "sent" };
    },
  };
  return { ran, node };
}

describe("an onExecute hook that fails never hides a command that ran", () => {
  it("a throwing hook: the result comes back", async () => {
    const { ran, node } = counted();
    const kernel = createKernel({
      roots: [node],
      onExecute: () => {
        throw new Error("audit log is down");
      },
    });
    const res = await kernel.command({ path: [{ id: "send" }], execute: true }, ctx);
    expect(res.kind === "result" && res.result.message).toBe("sent");
    expect(ran).toEqual(["send"]);
  });

  it("an async hook that rejects: the result comes back and nothing is left unhandled", async () => {
    const { node } = counted();
    let unhandled = 0;
    const onUnhandled = () => unhandled++;
    process.on("unhandledRejection", onUnhandled);
    try {
      const kernel = createKernel({
        roots: [node],
        onExecute: async () => {
          throw new Error("audit log is down");
        },
      });
      const res = await kernel.command({ path: [{ id: "send" }], execute: true }, ctx);
      expect(res.kind).toBe("result");
      await new Promise((r) => setTimeout(r, 5));
      expect(unhandled).toBe(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
