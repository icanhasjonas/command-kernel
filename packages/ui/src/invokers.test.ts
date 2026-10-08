import { expect, test } from "bun:test";
import type { CommandResponse, Ctx, Kernel, PathSegment } from "@command-kernel/core";
import { createKernel } from "@command-kernel/core";
import type { InvokerHandlers } from "./invokers.js";
import { bindInvokers, commandAttr, INVOKER_PREFIX, parseInvoker } from "./invokers.js";

test("commandAttr round-trips a plain path through parseInvoker", () => {
  const path: PathSegment[] = [{ id: "go.users" }];
  const value = commandAttr(path);
  expect(value.startsWith(INVOKER_PREFIX)).toBe(true);
  expect(parseInvoker(value)).toEqual(path);
});

test("commandAttr round-trips a gated path WITH tip args (the keystone reuse)", () => {
  const path: PathSegment[] = [{ id: "users.send_reset", args: { user: "jon@wall.north" } }];
  const value = commandAttr(path);
  // args ride inside the deeplink, since a CommandEvent carries no payload
  expect(value).toContain("user=jon%40wall.north");
  expect(parseInvoker(value)).toEqual(path);
});

test("parseInvoker ignores commands that are not ours", () => {
  // built-in invokers (the browser owns these) and other apps' custom commands
  expect(parseInvoker("show-modal")).toBeNull();
  expect(parseInvoker("--some-other-app:thing")).toBeNull();
  expect(parseInvoker("toggle-popover")).toBeNull();
});

test("a custom deeplink prefix round-trips on both ends", () => {
  const path: PathSegment[] = [
    { id: "users", args: {} },
    { id: "users.search", args: { q: "a" } },
  ];
  const value = commandAttr(path, { prefix: "k" });
  expect(parseInvoker(value, { prefix: "k" })).toEqual([
    { id: "users" },
    { id: "users.search", args: { q: "a" } },
  ]);
});

// ---- bindInvokers: the actual driver dispatch, against a REAL kernel ----

const ctx = (): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
});

const testKernel = (): Kernel =>
  createKernel({
    roots: [
      { id: "ping", title: "Ping", run: async () => ({ kind: "toast", message: "pong" }) },
      {
        id: "reset",
        title: "Send reset",
        gate: { confirm: true, reason: "sends email" },
        run: async () => ({ kind: "toast", message: "sent" }),
      },
      {
        id: "boom",
        title: "Boom",
        run: async () => {
          throw new Error("kaboom");
        },
      },
    ],
  });

/** A CommandEvent-shaped payload plus a host that records listener add/remove. */
function fakeHost() {
  type Listener = (e: { command: string; source: Element | null; preventDefault(): void }) => void;
  const listeners = new Set<Listener>();
  return {
    addEventListener: (_t: "command", l: Listener) => listeners.add(l),
    removeEventListener: (_t: "command", l: Listener) => listeners.delete(l),
    /** dispatch one command event; returns whether preventDefault was called */
    fire(command: string): boolean {
      let prevented = false;
      for (const l of listeners) {
        l({ command, source: null, preventDefault: () => (prevented = true) });
      }
      return prevented;
    },
    count: () => listeners.size,
  };
}

/** fire + drain the kernel's microtask chain */
async function fired(host: ReturnType<typeof fakeHost>, command: string): Promise<boolean> {
  const prevented = host.fire(command);
  await new Promise((r) => setTimeout(r, 0));
  return prevented;
}

test("a --ck: button runs through the kernel and lands in onResult", async () => {
  const host = fakeHost();
  const results: Extract<CommandResponse, { kind: "result" }>[] = [];
  bindInvokers(host, testKernel(), ctx, { onResult: (res) => results.push(res) });
  const prevented = await fired(host, commandAttr([{ id: "ping" }]));
  expect(prevented).toBe(true);
  expect(results.map((r) => r.result.message)).toEqual(["pong"]);
});

test("a gated command CANNOT auto-fire from markup - it lands in onGate", async () => {
  const host = fakeHost();
  const kinds: string[] = [];
  bindInvokers(host, testKernel(), ctx, {
    onResult: () => kinds.push("result"),
    onGate: (res) => kinds.push(`gate:${res.node.id}`),
  });
  await fired(host, commandAttr([{ id: "reset" }]));
  expect(kinds).toEqual(["gate:reset"]); // never a result - the gate held
});

test("a stale / typo'd command id lands in onUnresolved, not in silence", async () => {
  const host = fakeHost();
  const unresolved: string[] = [];
  bindInvokers(host, testKernel(), ctx, {
    onUnresolved: (res) => unresolved.push(res.kind),
  });
  await fired(host, commandAttr([{ id: "renamed.long.ago" }]));
  expect(unresolved).toEqual(["completions"]);
});

test("a throwing run() lands in onError with the decoded path", async () => {
  const host = fakeHost();
  const errors: { error: unknown; path: PathSegment[] }[] = [];
  bindInvokers(host, testKernel(), ctx, {
    onError: (error, path) => errors.push({ error, path }),
  });
  await fired(host, commandAttr([{ id: "boom" }]));
  expect(errors).toHaveLength(1);
  expect((errors[0]?.error as Error | undefined)?.message).toBe("kaboom");
  expect(errors[0]?.path).toEqual([{ id: "boom" }]);
});

test("built-in and foreign commands pass through untouched (no preventDefault)", async () => {
  const host = fakeHost();
  const handlers: InvokerHandlers = { onResult: () => {} };
  bindInvokers(host, testKernel(), ctx, handlers);
  expect(await fired(host, "show-modal")).toBe(false);
  expect(await fired(host, "--other-app:thing")).toBe(false);
});

test("the returned unbind removes the listener", async () => {
  const host = fakeHost();
  const results: string[] = [];
  const off = bindInvokers(host, testKernel(), ctx, {
    onResult: (r) => results.push(r.result.message),
  });
  expect(host.count()).toBe(1);
  off();
  expect(host.count()).toBe(0);
  await fired(host, commandAttr([{ id: "ping" }]));
  expect(results).toEqual([]);
});
