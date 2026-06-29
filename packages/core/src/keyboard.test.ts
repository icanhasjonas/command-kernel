import { describe, expect, it } from "bun:test";
import { validateShortcuts } from "./keyboard";
import { parseShortcut } from "./shortcut";
import type { CommandNode } from "./types";

// The keyboard driver uses DOM APIs (KeyboardEvent, window) so layer/chord
// tests run in the browser or a DOM environment. Here we test the pure parts
// (parseShortcut, validateShortcuts) that don't need DOM.

function node(id: string, shortcut?: string): CommandNode {
  return {
    id,
    title: id,
    ...(shortcut ? { shortcut } : {}),
    run: async () => ({ kind: "toast" as const, message: id }),
  };
}

describe("validateShortcuts", () => {
  it("returns empty for no conflicts", () => {
    const nodes = new Map<string, CommandNode>([
      ["mod+d", node("docs", "mod+d")],
      ["mod+a", node("agent", "mod+a")],
    ]);
    expect(validateShortcuts(nodes)).toEqual([]);
  });
});

describe("parseShortcut (integration)", () => {
  it("handles shift+mod+key for shortcut strings on nodes", () => {
    const n = node("docs", "shift+mod+d");
    const parsed = parseShortcut(n.shortcut as string);
    expect(parsed.key).toBe("d");
    expect(parsed.mod).toBe(true);
    expect(parsed.shift).toBe(true);
  });
});
