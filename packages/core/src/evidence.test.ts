import { describe, expect, it } from "bun:test";
import { createMemoryEvidenceStore, pathKey } from "./evidence.js";

describe("evidence — the honesty tag", () => {
  it("verifies a grant for the exact command+args+prior-path it was minted for", () => {
    const ev = createMemoryEvidenceStore();
    const g = ev.sign("users.reset", { user: "a@b.io" }, "users");
    expect(ev.verify(g, "users.reset", { user: "a@b.io" }, "users")).toBe(true);
  });

  it("arg order does not matter (canonical serialization)", () => {
    const ev = createMemoryEvidenceStore();
    const g = ev.sign("send", { to: "a@b.io", subject: "hi" }, "");
    expect(ev.verify(g, "send", { subject: "hi", to: "a@b.io" }, "")).toBe(true);
  });

  it("rejects different args (approve A can't run B)", () => {
    const ev = createMemoryEvidenceStore();
    const g = ev.sign("users.reset", { user: "a@b.io" }, "users");
    expect(ev.verify(g, "users.reset", { user: "evil@x.io" }, "users")).toBe(false);
  });

  it("rejects a different prior path (chain binding)", () => {
    const ev = createMemoryEvidenceStore();
    const g = ev.sign("reset", { user: "a@b.io" }, "users");
    expect(ev.verify(g, "reset", { user: "a@b.io" }, "submissions")).toBe(false);
  });

  it("rejects a forged tag", () => {
    const ev = createMemoryEvidenceStore();
    expect(ev.verify({ nonce: "x", sig: "deadbeef" }, "users.reset", {}, "")).toBe(false);
    expect(ev.verify(undefined, "users.reset", {}, "")).toBe(false);
  });

  it("rotating the session salt invalidates every prior grant (reload semantics)", () => {
    const ev = createMemoryEvidenceStore();
    const g = ev.sign("users.reset", { user: "a@b.io" }, "");
    expect(ev.verify(g, "users.reset", { user: "a@b.io" }, "")).toBe(true);
    ev.rotate();
    expect(ev.verify(g, "users.reset", { user: "a@b.io" }, "")).toBe(false);
  });

  it("grantForPath binds the tip to everything before it", () => {
    const ev = createMemoryEvidenceStore();
    const path = [{ id: "users" }, { id: "reset", args: { user: "a@b.io" } }];
    const g = ev.grantForPath(path);
    expect(ev.verify(g, "reset", { user: "a@b.io" }, pathKey([{ id: "users" }]))).toBe(true);
  });

  it("SEAM: stores are independent — a grant from one never verifies in another", () => {
    const a = createMemoryEvidenceStore();
    const b = createMemoryEvidenceStore();
    const g = a.sign("users.reset", { user: "a@b.io" }, "");
    expect(a.verify(g, "users.reset", { user: "a@b.io" }, "")).toBe(true);
    // different instance => different salt => the tag is meaningless (no module global)
    expect(b.verify(g, "users.reset", { user: "a@b.io" }, "")).toBe(false);
  });
});
