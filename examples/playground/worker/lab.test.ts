import { describe, expect, it } from "bun:test";
import type { Grant } from "@command-kernel/core";
import { labChanged } from "../src/wire/spec";
import { createLab, freshState, type Visitor } from "./lab";
import { createLimiter, onlineVisitors, visitorFrom, visitorFromQuery } from "./visitor";

/** A lab on in-memory storage, and every frame it broadcast. */
function lab() {
  const pushed: string[] = [];
  const spent = new Set<string>();
  const state = freshState();
  const l = createLab({
    key: crypto.getRandomValues(new Uint8Array(32)),
    state,
    persist: async () => {},
    spend: async (nonce) => (spent.has(nonce) ? false : (spent.add(nonce), true)),
    broadcast: (f) => pushed.push(f),
    online: () => 2,
  });
  const as = (visitor: Visitor) => ({
    frame: async (frame: object) =>
      JSON.parse(
        await l.wire.handleFrame(
          JSON.stringify({ id: "c1", ...frame }),
          l.ctxFor(visitor, 0, "AMS"),
        ),
      ),
  });
  return { l, state, pushed, as };
}

const admin: Visitor = { id: "aaaaaaaa11", role: "admin" };
const viewer: Visitor = { id: "bbbbbbbb22", role: "viewer" };
const otherAdmin: Visitor = { id: "cccccccc33", role: "admin" };

describe("the lab over the wire", () => {
  it("status reports the ctx the SERVER built, including the edge it came through", async () => {
    const { as } = lab();
    const r = await as(viewer).frame({ t: "cmd", name: "lab.status" });
    expect(r.t).toBe("ok");
    expect(r.data).toMatchObject({ colo: "AMS", online: 2, you: { visitor: "bbbbbb", role: "viewer" } });
  });

  it("a viewer cannot flip a flag; an advisor can, and every socket hears it", async () => {
    const { as, pushed, state } = lab();
    const no = await as(viewer).frame({ t: "cmd", name: "lab.flag", args: { flag: "maintenance" } });
    expect(no.error.code).toBe("forbidden");
    expect(state.flags.maintenance).toBe(false);
    const yes = await as({ id: "dddddddd44", role: "advisor" }).frame({
      t: "cmd",
      name: "lab.flag",
      args: { flag: "maintenance" },
    });
    expect(yes.data).toEqual({ flag: "maintenance", on: true });
    const evt = JSON.parse(pushed.at(-1) ?? "{}");
    expect(evt).toMatchObject({ t: "evt", name: labChanged.name });
    expect(evt.data.by).toEqual({ role: "advisor", tag: "dddddd" });
  });

  it("rotate owes a confirmation; the server mints a grant that works once, for those args, for that visitor", async () => {
    const { as, state } = lab();
    const before = state.keys.signing;
    const args = { key: "signing" };
    const owed = await as(admin).frame({ t: "cmd", name: "lab.rotate", args });
    expect(owed.error.code).toBe("confirmRequired");

    const confirmed = await as(admin).frame({ t: "confirm", name: "lab.rotate", args });
    const grant: Grant = confirmed.data.grant;
    expect(grant.sig).toMatch(/^[0-9a-f]{64}$/);

    // another visitor, other args, a forged byte: all refused, nothing rotates
    const stolen = await as(otherAdmin).frame({ t: "cmd", name: "lab.rotate", args, evidence: grant });
    expect(stolen.error.code).toBe("confirmRequired");
    const otherArgs = await as(admin).frame({
      t: "cmd",
      name: "lab.rotate",
      args: { key: "public" },
      evidence: grant,
    });
    expect(otherArgs.error.code).toBe("confirmRequired");
    const flipped = grant.sig.startsWith("0") ? `1${grant.sig.slice(1)}` : `0${grant.sig.slice(1)}`;
    const forged = await as(admin).frame({
      t: "cmd",
      name: "lab.rotate",
      args,
      evidence: { ...grant, sig: flipped },
    });
    expect(forged.error.code).toBe("confirmRequired");
    expect(state.keys.signing).toBe(before);

    const ran = await as(admin).frame({ t: "cmd", name: "lab.rotate", args, evidence: grant });
    expect(ran.t).toBe("ok");
    expect(state.keys.signing).not.toBe(before);
    const replay = await as(admin).frame({ t: "cmd", name: "lab.rotate", args, evidence: grant });
    expect(replay.error.code).toBe("confirmRequired");
  });

  it("a viewer cannot get a grant minted at all", async () => {
    const { as } = lab();
    const r = await as(viewer).frame({ t: "confirm", name: "lab.rotate", args: { key: "public" } });
    expect(r.error.code).toBe("forbidden");
  });

  it("HTTP reaches the same commands: GET /api/status", async () => {
    const { l } = lab();
    const res = await l.wire.handleHttp(
      new Request("https://lab.test/api/status"),
      l.ctxFor(viewer, 0, "SIN"),
    );
    expect(res?.status).toBe(200);
    expect(await res?.json()).toMatchObject({ colo: "SIN", you: { role: "viewer" } });
  });
});

describe("who is calling, and how often", () => {
  it("takes a visitor from headers or the socket query, and refuses anything else", () => {
    const h = new Headers({ "x-lab-visitor": "abcdef1234", "x-lab-role": "advisor" });
    expect(visitorFrom((n) => h.get(n))).toEqual({ id: "abcdef1234", role: "advisor" });
    expect(visitorFrom((n) => (n === "x-lab-role" ? "root" : "abcdef1234"))).toBeNull();
    expect(visitorFrom((n) => (n === "x-lab-role" ? "admin" : "../x"))).toBeNull();
    const url = new URL("https://lab.test/ws?visitor=abcdef1234&role=viewer");
    expect(visitorFromQuery(url)).toEqual({ id: "abcdef1234", role: "viewer" });
  });

  it("counts visitors, not sockets: a reload's leftover socket is the same visitor", () => {
    expect(
      onlineVisitors([
        { open: true, visitorId: "a" },
        { open: true, visitorId: "a" }, // React's dev double-mount, or a reload not yet noticed
        { open: false, visitorId: "b" }, // closing
        { open: true, visitorId: "c" },
      ]),
    ).toBe(2);
  });

  it("limits each key to `max` calls a window, and starts over after it", () => {
    let t = 0;
    const allow = createLimiter(2, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a"), allow("b")]).toEqual([true, true, false, true]);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
});
