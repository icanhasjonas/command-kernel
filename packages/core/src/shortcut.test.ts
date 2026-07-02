import { describe, expect, it } from "bun:test";
import { formatShortcut, parseShortcut } from "./shortcut.js";

describe("parseShortcut", () => {
  it("parses mod+key", () => {
    const p = parseShortcut("mod+d");
    expect(p).toEqual({ key: "d", mod: true, shift: false, alt: false, ctrl: false });
  });

  it("parses shift+mod+key", () => {
    const p = parseShortcut("shift+mod+d");
    expect(p).toEqual({ key: "d", mod: true, shift: true, alt: false, ctrl: false });
  });

  it("parses bare key", () => {
    const p = parseShortcut("Escape");
    expect(p).toEqual({ key: "escape", mod: false, shift: false, alt: false, ctrl: false });
  });

  it("accepts cmd/meta as aliases for mod", () => {
    expect(parseShortcut("cmd+d").mod).toBe(true);
    expect(parseShortcut("meta+d").mod).toBe(true);
  });

  it("accepts opt/option as aliases for alt", () => {
    expect(parseShortcut("opt+d").alt).toBe(true);
    expect(parseShortcut("option+d").alt).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(parseShortcut("Shift+Mod+D")).toEqual(parseShortcut("shift+mod+d"));
  });
});

describe("formatShortcut", () => {
  it("formats for display", () => {
    const formatted = formatShortcut("shift+mod+d");
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted.toUpperCase()).toContain("D");
  });

  it("formats a bare key", () => {
    const formatted = formatShortcut("Escape");
    expect(formatted).toBe("ESCAPE");
  });
});
