import { describe, expect, it } from "bun:test";
import { ctx } from "./fixtures.test-util.js";
import { frameId } from "./frame-id.js";
import { server } from "./review.fixtures.test-util.js";

/** K2-D4: an oversized frame's id is read only from the top-level object. */

const pad = "x".repeat(200);

describe("frameId", () => {
  it("ignores an id nested inside args", () => {
    expect(frameId(JSON.stringify({ t: "cmd", args: { id: "spoof", pad } }))).toBeNull();
  });

  it("finds the top-level id after a nested one", () => {
    const msg = `{"t":"cmd","args":{"id":"spoof","pad":"${pad}"},"id":"c9","name":"x"}`;
    expect(frameId(msg, 1024)).toBe("c9");
  });

  it("reads an id with escaped quotes, and skips a key-like string inside a value", () => {
    expect(frameId(JSON.stringify({ id: 'c"9', t: "cmd" }))).toBe('c"9');
    expect(frameId(JSON.stringify({ name: '","id":"spoof', id: "c1" }))).toBe("c1");
  });

  it("no top-level id, a non-text id, or not an object -> null", () => {
    expect(frameId(JSON.stringify({ t: "cmd", name: "x" }))).toBeNull();
    expect(frameId(JSON.stringify({ id: 7, args: { id: "spoof" } }))).toBeNull();
    expect(frameId(JSON.stringify([{ id: "c1" }]))).toBeNull();
    expect(frameId(`{"t":"cmd","id":"c9"`.slice(0, 16))).toBeNull();
  });

  it("only looks inside the scan window", () => {
    const msg = `{"t":"cmd","pad":"${pad}","id":"c9"}`;
    expect(frameId(msg, 100)).toBeNull();
  });
});

describe("an oversized frame", () => {
  it("answers with the top-level id, never one planted in args", async () => {
    const { wire } = server({ maxBytes: 40 });
    const msg = `{"t":"cmd","args":{"id":"spoof","pad":"${pad}"},"id":"c9","name":"x"}`;
    const res = JSON.parse(await wire.handleFrame(msg, ctx));
    expect([res.id, res.error.code]).toEqual(["c9", "tooLarge"]);
  });
});
