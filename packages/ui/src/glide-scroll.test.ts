import { describe, expect, test } from "bun:test";
import { keepInView } from "./useGlide.js";

describe("the active row is kept in the list's own view", () => {
  test("a row in view leaves the list where it is", () => {
    expect(keepInView(100, 300, 150, 40)).toBe(100);
  });
  test("a row above the view brings its top to the list's top", () => {
    expect(keepInView(100, 300, 60, 40)).toBe(60);
  });
  test("a row below the view brings its bottom to the list's bottom", () => {
    expect(keepInView(100, 300, 420, 40)).toBe(160);
  });
  test("a row taller than the view shows its top", () => {
    expect(keepInView(0, 30, 100, 40)).toBe(100);
  });
});
