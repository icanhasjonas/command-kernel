import { describe, expect, it } from "bun:test";
import {
  createKeyboard,
  type KernelKeyEvent,
  normalizeEvent,
  normalizeShortcut,
  validateShortcuts,
} from "./keyboard.js";
import { isMac, parseShortcut } from "./shortcut.js";
import type { CommandNode } from "./types.js";

// The driver is pure and instance-scoped — events are structural
// (KernelKeyEvent), so the whole layer stack + chord machine runs under bun
// with fake events. No DOM, no shared state between tests.

function node(id: string, shortcut?: string): CommandNode {
  return {
    id,
    title: id,
    ...(shortcut ? { shortcut } : {}),
    run: async () => ({ kind: "toast" as const, message: id }),
  };
}

function key(
  k: string,
  mods: Partial<KernelKeyEvent> = {},
): KernelKeyEvent & {
  prevented: boolean;
} {
  const e = {
    key: k,
    code: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    prevented: false,
    preventDefault() {
      e.prevented = true;
    },
    stopPropagation() {},
    ...mods,
  };
  return e;
}

/** a keydown carrying the platform's `mod` modifier (Cmd on Mac, Ctrl elsewhere) */
const modKey = (k: string) => key(k, isMac ? { metaKey: true } : { ctrlKey: true });

describe("layer stack", () => {
  it("the top layer wins; popping restores the one below", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ g: () => hits.push("below") });
    const top = kb.pushLayer({ g: () => hits.push("top") });
    kb.handleKeydown(key("g"));
    kb.popLayer(top);
    kb.handleKeydown(key("g"));
    expect(hits).toEqual(["top", "below"]);
  });

  it("a base layer stays below later modal layers", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ g: () => hits.push("modal") });
    kb.pushLayer({ g: () => hits.push("base") }, { base: true });
    kb.handleKeydown(key("g"));
    expect(hits).toEqual(["modal"]);
  });

  it("a disabled layer is skipped", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ g: () => hits.push("under") });
    kb.pushLayer({ g: () => hits.push("off") }, { enabled: false });
    kb.handleKeydown(key("g"));
    expect(hits).toEqual(["under"]);
  });

  it("a matched binding cancels the event; an unmatched key passes through", () => {
    const kb = createKeyboard();
    kb.pushLayer({ g: () => {} });
    const hit = key("g");
    const miss = key("x");
    kb.handleKeydown(hit);
    kb.handleKeydown(miss);
    expect(hit.prevented).toBe(true);
    expect(miss.prevented).toBe(false);
  });

  it("two instances share nothing — a layer on one never fires on the other", () => {
    const a = createKeyboard();
    const b = createKeyboard();
    const hits: string[] = [];
    a.pushLayer({ g: () => hits.push("a") });
    b.handleKeydown(key("g"));
    expect(hits).toEqual([]);
    a.handleKeydown(key("g"));
    expect(hits).toEqual(["a"]);
  });
});

describe("chord state machine", () => {
  it("a two-key chord fires after the prefix, and notifies both edges", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    const modes: (string | null)[] = [];
    const off = kb.subscribeChordMode((p) => modes.push(p));
    kb.pushLayer({ "g d": () => hits.push("docs") });
    const prefix = key("g");
    kb.handleKeydown(prefix);
    expect(prefix.prevented).toBe(true); // the prefix is consumed, not typed
    expect(kb.chordPrefix).toBe("g");
    kb.handleKeydown(key("d"));
    off();
    expect(hits).toEqual(["docs"]);
    expect(modes).toEqual(["g", null]);
    expect(kb.chordPrefix).toBeNull();
  });

  it("a wrong second key exits chord mode without firing", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ "g d": () => hits.push("docs") });
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("x"));
    expect(hits).toEqual([]);
    expect(kb.chordPrefix).toBeNull();
  });

  it("the chord times out back to normal dispatch", async () => {
    const kb = createKeyboard({ chordTimeoutMs: 10 });
    const hits: string[] = [];
    kb.pushLayer({ "g d": () => hits.push("docs"), d: () => hits.push("plain-d") });
    kb.handleKeydown(key("g"));
    await new Promise((r) => setTimeout(r, 25));
    expect(kb.chordPrefix).toBeNull();
    kb.handleKeydown(key("d"));
    expect(hits).toEqual(["plain-d"]); // the chord expired; d is plain again
  });
});

describe("registerShortcuts (pure — no DOM event construction)", () => {
  it("normalizeShortcut agrees with normalizeEvent for the same keystroke", () => {
    const viaEvent = normalizeEvent({ ...modKey("k"), shiftKey: true });
    expect(normalizeShortcut(parseShortcut("mod+shift+K"))).toBe(viaEvent);
  });

  it("a registered node fires from the matching keydown", () => {
    const kb = createKeyboard();
    const activated: string[] = [];
    kb.registerShortcuts(new Map([["mod+k", node("palette", "mod+k")]]), {
      onActivate: (n) => activated.push(n.id),
    });
    kb.handleKeydown(modKey("k"));
    expect(activated).toEqual(["palette"]);
  });
});

describe("validateShortcuts", () => {
  it("returns empty for no conflicts", () => {
    const nodes = new Map<string, CommandNode>([
      ["mod+d", node("docs", "mod+d")],
      ["mod+a", node("agent", "mod+a")],
    ]);
    expect(validateShortcuts(nodes)).toEqual([]);
  });

  it("flags two nodes on the same normalized key", () => {
    const conflicts = validateShortcuts(
      new Map<string, CommandNode>([
        ["mod+d", node("docs", "mod+d")],
        ["cmd+d", node("dupes", "cmd+d")],
      ]),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.nodeIds.sort()).toEqual(["docs", "dupes"]);
  });
});

describe("parseShortcut (integration)", () => {
  it("handles shift+mod+key for shortcut strings on nodes", () => {
    const n = node("docs", "shift+mod+d");
    const parsed = parseShortcut(n.shortcut ?? "");
    expect(parsed.key).toBe("d");
    expect(parsed.mod).toBe(true);
    expect(parsed.shift).toBe(true);
  });
});
