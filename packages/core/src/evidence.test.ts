import { describe, expect, it } from "bun:test";
import { grantForPath, pathKey, rotateSessionSalt, signGrant, verifyGrant } from "./evidence";

describe("evidence — the honesty tag", () => {
  it("verifies a grant for the exact command+args+prior-path it was minted for", () => {
    const g = signGrant("users.reset", { user: "a@b.io" }, "users");
    expect(verifyGrant(g, "users.reset", { user: "a@b.io" }, "users")).toBe(true);
  });

  it("arg order does not matter (canonical serialization)", () => {
    const g = signGrant("send", { to: "a@b.io", subject: "hi" }, "");
    expect(verifyGrant(g, "send", { subject: "hi", to: "a@b.io" }, "")).toBe(true);
  });

  it("rejects different args (approve A can't run B)", () => {
    const g = signGrant("users.reset", { user: "a@b.io" }, "users");
    expect(verifyGrant(g, "users.reset", { user: "evil@x.io" }, "users")).toBe(false);
  });

  it("rejects a different prior path (chain binding)", () => {
    const g = signGrant("reset", { user: "a@b.io" }, "users");
    expect(verifyGrant(g, "reset", { user: "a@b.io" }, "submissions")).toBe(false);
  });

  it("rejects a forged tag", () => {
    expect(verifyGrant({ nonce: "x", sig: "deadbeef" }, "users.reset", {}, "")).toBe(false);
    expect(verifyGrant(undefined, "users.reset", {}, "")).toBe(false);
  });

  it("rotating the session salt invalidates every prior grant (reload semantics)", () => {
    const g = signGrant("users.reset", { user: "a@b.io" }, "");
    expect(verifyGrant(g, "users.reset", { user: "a@b.io" }, "")).toBe(true);
    rotateSessionSalt();
    expect(verifyGrant(g, "users.reset", { user: "a@b.io" }, "")).toBe(false);
  });

  it("grantForPath binds the tip to everything before it", () => {
    const path = [{ id: "users" }, { id: "reset", args: { user: "a@b.io" } }];
    const g = grantForPath(path);
    expect(verifyGrant(g, "reset", { user: "a@b.io" }, pathKey([{ id: "users" }]))).toBe(true);
  });
});
