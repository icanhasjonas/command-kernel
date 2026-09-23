import { afterEach, describe, expect, test } from "bun:test";
import { createKernel } from "./create-kernel.js";
import { createMemoryEvidenceStore } from "./evidence.js";

/**
 * Cloudflare Workers refuse randomness at module scope ("Disallowed operation called within
 * global scope"), and a host builds its kernel there. So building a kernel, or its default
 * evidence store, must draw nothing: the key is drawn on first use, inside a request.
 */

const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
let draws = 0;
const counting = <T extends ArrayBufferView | null>(a: T): T => {
  draws++;
  return real(a as never) as T;
};

afterEach(() => {
  globalThis.crypto.getRandomValues = real;
  draws = 0;
});

describe("the default evidence store at module scope", () => {
  test("building a store or a kernel draws no random bytes", () => {
    globalThis.crypto.getRandomValues = counting;
    createMemoryEvidenceStore();
    createKernel({ roots: [] });
    expect(draws).toBe(0);
  });

  test("the key is drawn once, on first use, and grants still verify", () => {
    const store = createMemoryEvidenceStore();
    globalThis.crypto.getRandomValues = counting;
    const g = store.sign("x.do", { a: "1" }, "k", { nonce: "n" });
    expect(draws).toBe(1);
    expect(store.verify(g, "x.do", { a: "1" }, "k")).toBe(true);
    expect(store.verify(g, "x.do", { a: "2" }, "k")).toBe(false);
    expect(draws).toBe(1);
  });

  test("two stores still hold two keys", () => {
    const a = createMemoryEvidenceStore();
    const b = createMemoryEvidenceStore();
    const g = a.sign("x.do", {}, "k", { nonce: "n" });
    expect(b.verify(g, "x.do", {}, "k")).toBe(false);
  });
});
