import { describe, expect, it } from "bun:test";
import { type Ctx, createKernel } from "@command-kernel/core";
import { defineCommand, implement } from "./define.js";
import { ctx } from "./fixtures.test-util.js";
import { post } from "./review.fixtures.test-util.js";
import { createWireServer } from "./server.js";

/**
 * A prefilled arg is the SERVER's value (from the ctx the host built). The kernel
 * merges `{ ...prefill, ...args }`, which suits a palette where a person edits a
 * default, but over the wire it would let any caller replace it. The wire refuses
 * a caller's value for a prefilled key, equal or not (an equal-only pass would let
 * a caller probe the server's value one guess at a time).
 */

const archive = defineCommand<{ threadId: string; tenant?: string }, { tenant: string }>()({
  id: "thread.archive",
  title: "Archive",
  prefill: (c: Ctx) => ({ tenant: `tenant-of-${c.user.id}` }),
  args: [
    { id: "threadId", label: "thread", kind: "string", required: true },
    { id: "tenant", label: "tenant", kind: "string" },
  ],
});

function setup(prefillThrows = false) {
  const ran: unknown[] = [];
  const node = implement(archive, async ({ tenant }) => {
    ran.push(tenant);
    return { tenant: tenant ?? "" };
  });
  const kernel = createKernel({
    roots: [
      prefillThrows
        ? {
            ...node,
            prefill: () => {
              throw new Error("no tenant");
            },
          }
        : node,
    ],
  });
  const wire = createWireServer({ kernel, specs: [archive], confirm: () => true });
  return { wire, ran };
}

const frame = async (w: ReturnType<typeof createWireServer>, t: string, args: object) =>
  JSON.parse(await w.handleFrame(JSON.stringify({ t, id: "c", name: archive.node.id, args }), ctx));

describe("a caller cannot override a prefilled arg", () => {
  it("POST, socket and confirm all answer invalidArguments naming the arg, and nothing runs", async () => {
    const { wire, ran } = setup();
    for (const tenant of ["someone-else", "tenant-of-u1"]) {
      const res = await post(wire, "thread.archive", {
        body: JSON.stringify({ threadId: "t1", tenant }),
      });
      const body = await res?.json();
      expect([res?.status, body?.code]).toEqual([400, "invalidArguments"]);
      expect(body?.errors?.[0]?.argId).toBe("tenant");
      for (const t of ["cmd", "confirm"]) {
        const out = await frame(wire, t, { threadId: "t1", tenant });
        expect(out.error.code).toBe("invalidArguments");
      }
    }
    expect(ran).toEqual([]);
  });

  it("without the key the prefilled value runs", async () => {
    const { wire, ran } = setup();
    const res = await post(wire, "thread.archive", { body: '{"threadId":"t1"}' });
    expect(await res?.json()).toEqual({ tenant: "tenant-of-u1" });
    expect(ran).toEqual(["tenant-of-u1"]);
  });

  it("a prefill of '' set nothing, so the caller may send that arg", async () => {
    const kernel = createKernel({
      roots: [
        {
          ...implement(archive, async ({ tenant }) => ({ tenant: tenant ?? "" })),
          prefill: () => ({ tenant: "" }),
        },
      ],
    });
    const wire = createWireServer({ kernel, specs: [archive] });
    const res = await post(wire, "thread.archive", { body: '{"threadId":"t1","tenant":"t9"}' });
    expect(await res?.json()).toEqual({ tenant: "t9" });
  });

  it("a prefill that throws is a serverFail, never the exception", async () => {
    const { wire } = setup(true);
    const res = await post(wire, "thread.archive", { body: '{"threadId":"t1","tenant":"x"}' });
    const text = await res?.text();
    expect(res?.status).toBe(500);
    expect(text).not.toContain("no tenant");
  });
});
