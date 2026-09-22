import { describe, expect, it } from "bun:test";
import { CommandError, createKernel } from "@command-kernel/core";
import { createWireClient } from "./client.js";
import type { WireCallError } from "./client-error.js";
import { defineCommand, implement } from "./define.js";
import { commandManifest, renderCommandDocs } from "./docs.js";
import {
  ctx,
  FakeSocket,
  makeServer,
  setSeen as setSeenSpec,
  waitFor,
} from "./fixtures.test-util.js";
import { serverStatus, statusOf } from "./protocol.js";
import { createWireServer } from "./server.js";

/** One regression per defect found in review of the wire package (W1..W14). */

const toast = defineCommand<object, never>()({ id: "say.hi", title: "Say hi" });
const quiet = defineCommand<object, undefined>()({ id: "say.nothing", title: "Nothing" });
const gated = defineCommand<{ n: number }, { ok: boolean }>()({
  id: "danger",
  title: "Danger",
  gate: { confirm: true },
  args: [{ id: "n", label: "n", kind: "number", required: true }],
});
const thrower = (code: string) =>
  defineCommand<object, never>()({ id: `throw.${code}`, title: code });

function server(
  extra: Parameters<typeof createWireServer>[0] extends infer O ? Partial<O> : never = {},
) {
  const kernel = createKernel({
    roots: [
      { ...toast.node, run: async () => ({ kind: "toast", message: "hi", payload: { x: 1 } }) },
      implement(quiet, async () => undefined),
      implement(gated, async () => ({ ok: true })),
      ...["timeout", "weird"].map((c) =>
        implement(thrower(c), async () => {
          throw new CommandError(c, "nope");
        }),
      ),
    ],
  });
  return { kernel, wire: createWireServer({ kernel, ...extra }) };
}
/** The error a call ended in (a test that expects failure). */
const failed = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (e: unknown) => e as WireCallError,
  );
const post = (w: ReturnType<typeof createWireServer>, name: string, init: RequestInit = {}) =>
  w.handleHttp(new Request(`https://x/api/${name}`, { method: "POST", ...init }), ctx);

describe("server", () => {
  it("W1: a client-only or unknown code thrown by run() never crashes the Response", async () => {
    const { wire } = server({ statusFor: () => 600 });
    expect((await post(wire, "throw.timeout"))?.status).toBe(500);
    expect((await post(wire, "throw.weird"))?.status).toBe(500);
  });

  it("W2: a grant travels over HTTP (header) and the socket (field); a malformed one is refused", async () => {
    const { kernel, wire } = server();
    const first = await (await post(wire, "danger", { body: '{"n":2}' }))?.json();
    expect(first.code).toBe("confirmRequired");
    const grant = kernel.grantFor({
      kind: "gate",
      node: { ...gated.node },
      verdict: { allowed: true, needsConfirm: true, checks: [] },
      args: first.details.args,
      priorKey: first.details.priorKey,
    });
    const viaHttp = await post(wire, "danger", {
      body: '{"n":2}',
      headers: { "command-evidence": `${grant.nonce}.${grant.sig}` },
    });
    expect(await viaHttp?.json()).toEqual({ ok: true });
    const viaWs = JSON.parse(
      await wire.handleFrame(
        JSON.stringify({ t: "cmd", id: "c", name: "danger", args: { n: 2 }, evidence: grant }),
        ctx,
      ),
    );
    expect(viaWs.data).toEqual({ ok: true });
    expect((await post(wire, "danger", { headers: { "command-evidence": "junk" } }))?.status).toBe(
      400,
    );
  });

  it("W4: a chunked body is refused at the limit without reading it all", async () => {
    const { wire } = server({ maxBytes: 10 });
    let pulled = 0;
    const body = new ReadableStream({
      pull(c) {
        pulled++;
        c.enqueue(new TextEncoder().encode("x".repeat(1024)));
        if (pulled > 100) c.close();
      },
    });
    const res = await post(wire, "say.hi", { body, duplex: "half" } as RequestInit);
    expect(res?.status).toBe(413);
    expect(pulled).toBeLessThan(5);
  });

  it("W10: a literal route beats a param route; two identical shapes throw", () => {
    const byId = defineCommand<{ id: string }, unknown>()(
      { id: "a", title: "a" },
      { http: { method: "GET", path: "/boxes/:id" } },
    );
    const fresh = defineCommand<object, unknown>()(
      { id: "b", title: "b" },
      { http: { method: "GET", path: "/boxes/new" } },
    );
    const kernel = createKernel({ roots: [] });
    expect(() => createWireServer({ kernel, specs: [byId, fresh] })).not.toThrow();
    const clash = defineCommand<{ x: string }, unknown>()(
      { id: "c", title: "c" },
      { http: { method: "GET", path: "/boxes/:x" } },
    );
    expect(() => createWireServer({ kernel, specs: [byId, clash] })).toThrow(
      "match the same paths",
    );
  });

  it("W13: the heartbeat ping is answered with pong, not an error", async () => {
    expect(await makeServer().handleFrame("ping", ctx)).toBe("pong");
  });
});

describe("both transports hand back the same thing (W3)", () => {
  const { wire } = server();
  const fetchIt = async (url: string, init?: RequestInit) =>
    (await wire.handleHttp(new Request(`https://x${url}`, init), ctx)) ??
    new Response("", { status: 404 });
  const socket = (url: string) => new FakeSocket(url, wire);

  for (const [name, want] of [
    ["say.hi", { kind: "toast", message: "hi", payload: { x: 1 } }],
    ["say.nothing", null],
  ] as const) {
    it(`${name}`, async () => {
      const c = createWireClient({
        http: "/api",
        ws: "wss://x",
        fetch: fetchIt,
        socket,
        heartbeat: false,
      });
      const overHttp = await c.callName(name);
      c.connect();
      FakeSocket.all.at(-1)?.open();
      const overWs = await c.callName(name);
      expect(overHttp).toEqual(want);
      expect(overWs).toEqual(want);
      c.close();
    });
  }
});

describe("client", () => {
  const httpOnly = (fetch: (u: string, i?: RequestInit) => Promise<Response>) =>
    createWireClient({ http: "/api", fetch });

  it("W6: an aborted call is `aborted`, not retryable, and a pre-aborted signal never fetches", async () => {
    let fetched = 0;
    const c = httpOnly(async () => {
      fetched++;
      return new Response("{}");
    });
    const e = await failed(
      c.call(
        setSeenSpec,
        { boxId: "b", threadId: "t", seen: true },
        { signal: AbortSignal.abort() },
      ),
    );
    expect([e.code, e.retryable, fetched]).toEqual(["aborted", false, 0]);
  });

  it("W7: a throwing headers() is a WireCallError, not a raw exception", async () => {
    const c = createWireClient({
      http: "/api",
      fetch: async () => new Response("{}"),
      headers: () => {
        throw new Error("no token");
      },
    });
    const e = await failed(c.callName("x"));
    expect(e.name).toBe("WireCallError");
  });

  it("W8: a route that cannot be filled is invalidArguments, never retryable", async () => {
    const get = defineCommand<{ id: string }, unknown>()(
      { id: "g", title: "g" },
      { http: { method: "GET", path: "/g/:id" } },
    );
    const e = await failed(httpOnly(async () => new Response("{}")).call(get, { id: "" }));
    expect([e.code, e.retryable]).toEqual(["invalidArguments", false]);
  });

  it("W11: one throwing event handler does not stop the others, and is reported", () => {
    const errors: unknown[] = [];
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u),
      heartbeat: false,
      onError: (e) => errors.push(e),
    });
    const got: number[] = [];
    c.on({ name: "e", summary: "" }, () => {
      throw new Error("bad handler");
    });
    c.on({ name: "e", summary: "" }, () => got.push(1));
    c.connect();
    FakeSocket.all.at(-1)?.open();
    FakeSocket.all.at(-1)?.push('{"t":"evt","name":"e"}');
    expect([got, errors.length]).toEqual([[1], 1]);
    c.close();
  });

  it("W12: after close(), connect() starts fresh (connecting, not reconnecting)", () => {
    const seen: string[] = [];
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u),
      heartbeat: false,
      random: () => 0,
    });
    c.onStatus((s) => seen.push(s));
    c.connect();
    FakeSocket.all.at(-1)?.close(); // one failed attempt raises the backoff exponent
    c.close();
    c.connect();
    expect(seen.at(-1)).toBe("connecting");
    c.close();
  });
});

describe("docs (W14)", () => {
  it("sort by code unit, the same on every machine", () => {
    const specs = ["b", "B", "a", "_"].map((id) =>
      defineCommand<object, unknown>()({ id, title: id }),
    );
    expect(commandManifest(specs).commands.map((c) => c.id)).toEqual(["B", "_", "a", "b"]);
  });
});

describe("review round 2", () => {
  it("D1: a quiet socket is only dropped when a ping goes unanswered", async () => {
    const live = new Set<FakeSocket>();
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      heartbeat: { intervalMs: 5, ping: "ping", pong: "pong", pongWaitMs: 30 },
      socket: (u) => {
        const s = new FakeSocket(u, makeServer(), false);
        live.add(s);
        return s;
      },
      random: () => 0,
    });
    c.connect();
    const sock = FakeSocket.all.at(-1);
    sock?.open();
    // pings go out, and each is answered late but before its deadline
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 8));
      sock?.push("pong");
    }
    expect(c.status).toBe("open");
    expect(live.size).toBe(1);
    c.close();
  });

  it("D2: a call that times out makes the socket prove it is alive", async () => {
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      timeoutMs: 10,
      heartbeat: { intervalMs: 10_000, ping: "ping", pong: "pong", pongWaitMs: 20 },
      socket: (u) => new FakeSocket(u, makeServer(), false),
      random: () => 0,
    });
    c.connect();
    FakeSocket.all.at(-1)?.open();
    await failed(c.callName("thread.list", { boxId: "b1" }));
    expect(FakeSocket.all.at(-1)?.sent).toContain("ping");
    await waitFor(() => FakeSocket.all.length > 1); // no pong came: the socket is replaced
    c.close();
  });

  it("D3: a socket factory that throws does not end reconnecting", async () => {
    let made = 0;
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      heartbeat: false,
      random: () => 0,
      socket: (u) => {
        made++;
        if (made > 1 && made < 4) throw new Error("no token");
        return new FakeSocket(u);
      },
    });
    c.connect();
    FakeSocket.all.at(-1)?.close();
    await waitFor(() => made >= 4);
    FakeSocket.all.at(-1)?.open();
    expect(c.status).toBe("open");
    c.close();
  });

  it("D4: an oversized frame answers tooLarge and still settles the call", async () => {
    const wire = createWireServer({ kernel: server().kernel, maxBytes: 40 });
    const frame = JSON.stringify({
      t: "cmd",
      id: "c9",
      name: "say.hi",
      args: { pad: "x".repeat(200) },
    });
    const res = JSON.parse(await wire.handleFrame(frame, ctx));
    expect([res.id, res.error.code, res.error.status]).toEqual(["c9", "tooLarge", 413]);
  });

  it("D6: the server mints a grant only when the host's policy says so", async () => {
    const kernel = server().kernel;
    const asked: string[] = [];
    const yes = createWireServer({ kernel, confirm: ({ name }) => (asked.push(name), true) });
    const no = createWireServer({ kernel, confirm: () => false });
    const off = createWireServer({ kernel });
    const args = { n: 2 };
    const minted = await yes.confirmCall("danger", args, ctx);
    expect(
      minted.ok && (minted.result.payload as { grant: { sig: string } }).grant.sig,
    ).toBeTruthy();
    expect(asked).toEqual(["danger"]);
    expect(!(await no.confirmCall("danger", args, ctx)).ok).toBe(true);
    expect(!(await off.confirmCall("danger", args, ctx)).ok).toBe(true);
    // and a command that is not gated cannot be "confirmed"
    expect(!(await yes.confirmCall("say.hi", {}, ctx)).ok).toBe(true);
  });

  it("D7: a frame that is not ours never breaks the socket handler", () => {
    const c = createWireClient({
      http: "/api",
      ws: "wss://x",
      socket: (u) => new FakeSocket(u),
      heartbeat: false,
    });
    c.connect();
    const sock = FakeSocket.all.at(-1);
    sock?.open();
    for (const junk of ["null", "7", '"hi"', '{"t":"other","id":"c1"}', "{"]) {
      expect(() => sock?.push(junk)).not.toThrow();
    }
    c.close();
  });

  it("D9: a literal segment wins at the first position that differs", async () => {
    const kernel = server().kernel;
    const a = defineCommand<{ x: string }, unknown>()(
      { id: "a", title: "a" },
      { http: { method: "GET", path: "/:x/b" } },
    );
    const b = defineCommand<{ y: string }, unknown>()(
      { id: "b", title: "b" },
      { http: { method: "GET", path: "/a/:y" } },
    );
    const wire = createWireServer({ kernel, specs: [a, b] });
    expect(await wire.handleHttp(new Request("https://x/api/a/b"), ctx)).not.toBeNull();
  });

  it("D10: doc anchors are GitHub slugs", () => {
    expect(renderCommandDocs("x", [setSeenSpec])).toContain("(#threadsetseen)");
  });

  it("D11: a code named like an Object member is not a status", () => {
    expect(statusOf("constructor")).toBe(400);
    expect(serverStatus("toString")).toBe(400);
  });

  it("D12: OPTIONS says what the path accepts; GET on a command path says POST", async () => {
    const { wire } = server();
    const withSpecs = createWireServer({ kernel: server().kernel, specs: [setSeenSpec] });
    const options = await wire.handleHttp(
      new Request("https://x/api/say.hi", { method: "OPTIONS" }),
      ctx,
    );
    expect([options?.status, options?.headers.get("allow")]).toEqual([
      204,
      "GET, HEAD, POST, OPTIONS",
    ]);
    const get = await withSpecs.handleHttp(new Request("https://x/api/thread.setSeen"), ctx);
    expect([get?.status, get?.headers.get("allow")]).toEqual([405, "POST"]);
  });
});
