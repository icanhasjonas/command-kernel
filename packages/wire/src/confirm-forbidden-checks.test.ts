import { describe, expect, it } from "bun:test";
import { type Ctx, createKernel } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { runCall } from "./outcome.js";
import { createWireServer } from "./server.js";

/**
 * A confirm the gate refuses answers like a call the gate refuses: `forbidden`, WITH the
 * gate's checks, so a client can say what is missing ("needs the admin role"). It used
 * to answer `forbidden` with no checks at all (B13), while the same call carried them.
 */

const rotate = defineCommand<{ key: string }, { ok: boolean }>()({
  id: "key.rotate",
  title: "Rotate a key",
  gate: { roles: ["admin"], confirm: true },
  args: [{ id: "key", label: "key", kind: "string", required: true }],
});

const as = (role: string): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "c" },
  now: 0,
  frecency: {},
});

const kernel = createKernel({ roots: [implement(rotate, async () => ({ ok: true }))] });
const wire = createWireServer({ kernel, specs: [rotate], confirm: () => true });

describe("a confirm the gate refuses carries the gate's checks (B13)", () => {
  it("confirmCall: forbidden, with the failed role check", async () => {
    const out = await wire.confirmCall("key.rotate", { key: "signing" }, as("viewer"));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("forbidden");
    expect(out.error.checks?.find((c) => !c.ok)?.label).toBe("role: admin");
  });

  it("the same as the call itself answers", async () => {
    // the path a call takes on both transports
    const call = await runCall(kernel, "key.rotate", { key: "signing" }, as("viewer"), undefined);
    const confirm = await wire.confirmCall("key.rotate", { key: "signing" }, as("viewer"));
    expect(call.ok || confirm.ok).toBe(false);
    if (call.ok || confirm.ok) return;
    expect(confirm.error.checks).toEqual(call.error.checks);
  });
});
