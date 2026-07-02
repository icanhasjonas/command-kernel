import { beforeEach, describe, expect, it } from "bun:test";
import {
  _test,
  handleKeydown,
  type KernelKeyEvent,
  normalizeShortcut,
  registerShortcuts,
  setChordTimeout,
  subscribeChordMode,
  validateShortcuts,
} from "./keyboard";
import { isMac, parseShortcut } from "./shortcut";
import type { CommandNode } from "./types";

// The driver is pure — events are structural (KernelKeyEvent), so the whole
// layer stack + chord machine runs under bun with fake events. No DOM needed.

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

beforeEach(() => _test.reset());

describe("layer stack", () => {
  it("the top layer wins; popping restores the one below", () => {
    const hits: string[] = [];
    const below = _test.pushLayer({ g: () => hits.push("below") });
    const top = _test.pushLayer({ g: () => hits.push("top") });
    handleKeydown(key("g"));
    _test.popLayer(top);
    handleKeydown(key("g"));
    _test.popLayer(below);
    expect(hits).toEqual(["top", "below"]);
  });

  it("a base layer stays below later modal layers", () => {
    const hits: string[] = [];
    _test.pushLayer({ g: () => hits.push("modal") });
    _test.pushLayer({ g: () => hits.push("base") }, { base: true });
    handleKeydown(key("g"));
    expect(hits).toEqual(["modal"]);
  });

  it("a disabled layer is skipped", () => {
    const hits: string[] = [];
    _test.pushLayer({ g: () => hits.push("under") });
    _test.pushLayer({ g: () => hits.push("off") }, { enabled: false });
    handleKeydown(key("g"));
    expect(hits).toEqual(["under"]);
  });

  it("a matched binding cancels the event; an unmatched key passes through", () => {
    _test.pushLayer({ g: () => {} });
    const hit = key("g");
    const miss = key("x");
    handleKeydown(hit);
    handleKeydown(miss);
    expect(hit.prevented).toBe(true);
    expect(miss.prevented).toBe(false);
  });
});

describe("chord state machine", () => {
  it("a two-key chord fires after the prefix, and notifies both edges", () => {
    const hits: string[] = [];
    const modes: (string | null)[] = [];
    const off = subscribeChordMode((p) => modes.push(p));
    _test.pushLayer({ "g d": () => hits.push("docs") });
    const prefix = key("g");
    handleKeydown(prefix);
    expect(prefix.prevented).toBe(true); // the prefix is consumed, not typed
    expect(_test.getActiveChord()?.prefix).toBe("g");
    handleKeydown(key("d"));
    off();
    expect(hits).toEqual(["docs"]);
    expect(modes).toEqual(["g", null]);
    expect(_test.getActiveChord()).toBeNull();
  });

  it("a wrong second key exits chord mode without firing", () => {
    const hits: string[] = [];
    _test.pushLayer({ "g d": () => hits.push("docs") });
    handleKeydown(key("g"));
    handleKeydown(key("x"));
    expect(hits).toEqual([]);
    expect(_test.getActiveChord()).toBeNull();
  });

  it("the chord times out back to normal dispatch", async () => {
    setChordTimeout(10);
    const hits: string[] = [];
    _test.pushLayer({ "g d": () => hits.push("docs"), d: () => hits.push("plain-d") });
    handleKeydown(key("g"));
    await new Promise((r) => setTimeout(r, 25));
    expect(_test.getActiveChord()).toBeNull();
    handleKeydown(key("d"));
    setChordTimeout(2000);
    expect(hits).toEqual(["plain-d"]); // the chord expired; d is plain again
  });
});

describe("registerShortcuts (pure — no DOM event construction)", () => {
  it("normalizeShortcut agrees with normalizeEvent for the same keystroke", () => {
    const viaEvent = _test.normalizeEvent({ ...modKey("k"), shiftKey: true });
    expect(normalizeShortcut(parseShortcut("mod+shift+K"))).toBe(viaEvent);
  });

  it("a registered node fires from the matching keydown", () => {
    const activated: string[] = [];
    const layer = registerShortcuts(new Map([["mod+k", node("palette", "mod+k")]]), {
      onActivate: (n) => activated.push(n.id),
    });
    handleKeydown(modKey("k"));
    _test.popLayer(layer);
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
