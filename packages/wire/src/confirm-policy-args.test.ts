import { describe, expect, it } from "bun:test";
import { type ArgValues, createKernel } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { post } from "./harness.test-util.js";
import { createWireServer } from "./server.js";

/**
 * The confirm policy decides on the args the grant is signed over: after prefill and
 * coercion. Deciding on the raw client args would approve one thing and sign another.
 */

const transfer = defineCommand<{ amount: number; account?: string }, { ok: boolean }>()({
  id: "transfer",
  title: "Transfer",
  gate: { confirm: true },
  prefill: () => ({ account: "acct-from-ctx" }),
  args: [
    { id: "amount", label: "amount", kind: "number", required: true },
    { id: "account", label: "account", kind: "string" },
  ],
});

function setup() {
  const seen: ArgValues[] = [];
  const kernel = createKernel({ roots: [implement(transfer, async () => ({ ok: true }))] });
  const wire = createWireServer({
    kernel,
    specs: [transfer],
    confirm: ({ args }) => {
      seen.push(args);
      return true;
    },
  });
  return { wire, seen };
}

describe("the confirm policy sees the args the grant signs", () => {
  it("over HTTP: coerced and prefilled", async () => {
    const { wire, seen } = setup();
    const res = await post(wire, "transfer?confirm", { body: '{"amount":"250"}' });
    expect(res?.status).toBe(200);
    expect(seen).toEqual([{ amount: 250, account: "acct-from-ctx" }]);
  });

  it("over a socket and confirmCall: the same", async () => {
    const { wire, seen } = setup();
    const msg = { t: "confirm", id: "c", name: "transfer", args: { amount: "7" } };
    expect(JSON.parse(await wire.handleFrame(JSON.stringify(msg), ctx)).t).toBe("ok");
    await wire.confirmCall("transfer", { amount: "7" }, ctx);
    expect(seen).toEqual([
      { amount: 7, account: "acct-from-ctx" },
      { amount: 7, account: "acct-from-ctx" },
    ]);
  });
});
