import { describe, expect, it } from "bun:test";
import { canonicalKey } from "./shortcut.js";
import { ariaKeyShortcuts, formatShortcut, shortcutKeys } from "./shortcut-display.js";

describe("shortcutKeys - the caps a <kbd> hint draws", () => {
  it("draws mod as ⌘ on a Mac and Ctrl elsewhere", () => {
    expect(shortcutKeys("mod+enter", "mac")).toEqual([["⌘", "Enter"]]);
    expect(shortcutKeys("mod+enter", "other")).toEqual([["Ctrl", "Enter"]]);
  });

  it("orders modifiers the way each platform prints them", () => {
    expect(shortcutKeys("mod+shift+c", "mac")).toEqual([["⇧", "⌘", "C"]]);
    expect(shortcutKeys("shift+mod+c", "other")).toEqual([["Ctrl", "Shift", "C"]]);
    expect(shortcutKeys("ctrl+alt+x", "mac")).toEqual([["⌃", "⌥", "X"]]);
  });

  it("draws a chord as one group per press", () => {
    expect(shortcutKeys("g i", "mac")).toEqual([["G"], ["I"]]);
    expect(shortcutKeys("g  1", "other")).toEqual([["G"], ["1"]]);
  });

  it("names keys by their cap, and never asks for Shift twice", () => {
    expect(shortcutKeys("Escape", "mac")).toEqual([["Esc"]]);
    expect(shortcutKeys("arrowdown", "mac")).toEqual([["↓"]]);
    expect(shortcutKeys("?", "mac")).toEqual([["?"]]);
    expect(shortcutKeys("shift+?", "other")).toEqual([["?"]]);
    expect(shortcutKeys("shift+u", "mac")).toEqual([["⇧", "U"]]);
    expect(shortcutKeys("+", "other")).toEqual([["+"]]);
  });
});

describe("formatShortcut - one line of text", () => {
  it("joins caps per platform and chord steps with a space", () => {
    expect(formatShortcut("mod+enter", "mac")).toBe("⌘Enter");
    expect(formatShortcut("mod+enter", "other")).toBe("Ctrl+Enter");
    expect(formatShortcut("g r", "mac")).toBe("G R");
  });
});

describe("ariaKeyShortcuts", () => {
  it("spells a single press for assistive tech", () => {
    expect(ariaKeyShortcuts("mod+enter", "mac")).toBe("Meta+Enter");
    expect(ariaKeyShortcuts("mod+enter", "other")).toBe("Control+Enter");
    expect(ariaKeyShortcuts("shift+mod+c", "other")).toBe("Control+Shift+C");
    expect(ariaKeyShortcuts("r", "mac")).toBe("R");
    expect(ariaKeyShortcuts("Escape", "mac")).toBe("Escape");
    expect(ariaKeyShortcuts("?", "mac")).toBe("?");
  });

  it("answers nothing for a chord, which the attribute cannot express", () => {
    expect(ariaKeyShortcuts("g i", "mac")).toBe("");
  });
});

describe("canonicalKey", () => {
  it("spells named keys as KeyboardEvent.key does, printables in lower case", () => {
    expect(canonicalKey("enter")).toBe("Enter");
    expect(canonicalKey("ESC")).toBe("Escape");
    expect(canonicalKey("down")).toBe("ArrowDown");
    expect(canonicalKey(" ")).toBe("Space");
    expect(canonicalKey("f5")).toBe("F5");
    expect(canonicalKey("K")).toBe("k");
    expect(canonicalKey("MediaPlayPause")).toBe("MediaPlayPause");
  });
});
