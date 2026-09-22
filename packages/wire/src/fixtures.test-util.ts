import { CommandError, type Ctx, createKernel, type GatePolicy } from "@command-kernel/core";
import type { WebSocketLike } from "./connection.js";
import { defineCommand, defineEvent, implement } from "./define.js";
import { createWireServer } from "./server.js";

/** A tiny mail-shaped API used by the wire tests: one of each kind of command. */

export interface TestCtx extends Ctx {
  boxes: string[];
}

export const listThreads = defineCommand<{ boxId: string; limit?: number }, { ids: string[] }>()(
  {
    id: "thread.list",
    title: "List threads",
    args: [
      { id: "boxId", label: "box", kind: "string", required: true },
      { id: "limit", label: "page size", kind: "number" },
    ],
  },
  { returns: "the thread ids, newest first" },
);

export const getMessage = defineCommand<
  { boxId: string; messageId: string },
  { subject: string }
>()(
  {
    id: "message.get",
    title: "Get a message",
    effect: "pure", // a GET route needs it said: it never writes
    args: [
      { id: "boxId", label: "box", kind: "string", required: true },
      { id: "messageId", label: "message", kind: "string", required: true },
    ],
  },
  {
    http: { method: "GET", path: "/boxes/:boxId/messages/:messageId", cache: "immutable" },
    errors: ["notFound"],
  },
);

export const setSeen = defineCommand<
  { boxId: string; threadId: string; seen: boolean },
  { seq: number }
>()({
  id: "thread.setSeen",
  title: "Mark seen",
  effect: "writes",
  args: [
    { id: "boxId", label: "box", kind: "string", required: true },
    { id: "threadId", label: "thread", kind: "string", required: true },
    { id: "seen", label: "seen", kind: "boolean", required: true },
  ],
});

export const boom = defineCommand<object, never>()({ id: "boom", title: "Explode" });

export const boxChanged = defineEvent<{ boxId: string; seq: number }>(
  "box.changed",
  "a box changed",
);

export const specs = [listThreads, getMessage, setSeen, boom];

/** Only boxes the caller holds are reachable: the gate reads the args. */
const boxGate: GatePolicy = (_node, ctx, args) => {
  const box = args?.boxId;
  const ok = typeof box !== "string" || (ctx as TestCtx).boxes.includes(box);
  return { allowed: ok, needsConfirm: false, checks: [{ label: `member of ${box}`, ok }] };
};

export function makeServer(onError?: (e: unknown) => void) {
  const kernel = createKernel({
    gate: boxGate,
    roots: [
      implement(listThreads, async ({ limit }) => ({ ids: ["t2", "t1"].slice(0, limit ?? 2) })),
      implement(getMessage, async ({ messageId }) => {
        if (messageId !== "m1")
          throw new CommandError("notFound", "No such message", { messageId });
        return { subject: "Hello" };
      }),
      implement(setSeen, async ({ seen }) => ({ seq: seen ? 8 : 9 })),
      implement(boom, async () => {
        throw new Error("secret internals");
      }),
    ],
  });
  return createWireServer({ kernel, specs, ...(onError && { onError }) });
}

export const ctx: TestCtx = {
  location: { module: "test" },
  user: { id: "u1", name: "U", role: "member", brand: "t" },
  now: 0,
  frecency: {},
  boxes: ["b1"],
};

/** A socket whose other end is a real wire server, with the network under test control. */
export class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  constructor(
    readonly url: string,
    private server = makeServer(),
    /** when false, frames go out but no answer ever comes (a dead link) */
    public answer = true,
  ) {
    FakeSocket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  send(data: string) {
    this.sent.push(data);
    if (!this.answer || data === "ping") return;
    void this.server.handleFrame(data, ctx).then((reply) => this.push(reply));
  }
  push(data: string) {
    if (this.readyState === 1) this.onmessage?.({ data });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({});
  }
}

/** The sockets one client made, in order: pass `socket` to createWireClient. */
export function track<S extends FakeSocket>(make: (u: string) => S) {
  const made: S[] = [];
  return {
    made,
    socket: (u: string) => {
      const s = make(u);
      made.push(s);
      return s;
    },
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until `cond` holds, instead of sleeping a fixed time (robust under load). */
export async function waitFor(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 2));
  }
}
