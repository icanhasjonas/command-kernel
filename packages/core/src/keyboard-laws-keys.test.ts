/**
 * THE LAYER LAWS, part 2 of 3: which PRESSES reach the stack and how keys are spelled (L7-L11).
 * Each `describe` is the law of the same number in docs/keyboard.md ("Layers").
 */

import { describe, expect, it } from "bun:test";
import { cmd, key, modKey, rig } from "./keyboard.test-util.js";

describe("L7 a widget comes first: a press it already handled is never offered", () => {
  it("defaultPrevented keeps the stack out of it", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ ArrowDown: on("next thread") });
    kb.handleKeydown(key("ArrowDown", { defaultPrevented: true }));
    kb.handleKeydown(key("ArrowDown"));
    expect(hits).toEqual(["next thread"]);
  });
});

describe("L8 typing beats commanding, on every layer", () => {
  it("a bare letter typed in a field fires on no layer, modal or base; mod+Enter still does", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ c: on("base c") }, { base: true });
    kb.pushLayer({ c: on("dialog c"), "mod+Enter": on("send") }, { modal: true });
    const field = { target: { tagName: "INPUT" } };
    kb.handleKeydown(key("c", field));
    kb.handleKeydown(modKey("Enter"));
    kb.handleKeydown(key("c"));
    expect(hits).toEqual(["send", "dialog c"]);
  });
});

describe("L9 a key pressed while an IME is composing is never a command", () => {
  it("isComposing, and Safari's keyCode 229, are left to the input method", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Enter: on("send"), Escape: on("close") });
    kb.handleKeydown(key("Enter", { isComposing: true }));
    kb.handleKeydown(key("Escape", { keyCode: 229 }));
    kb.handleKeydown(key("Enter"));
    expect(hits).toEqual(["send"]);
  });
});

describe("L10 a layer's keys are canonical: one key, one binding, however it is spelled", () => {
  it("mod+enter, Mod+Enter and a chord typed with capitals all bind", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "mod+enter": on("send"), "G I": on("inbox") });
    kb.handleKeydown(modKey("Enter"));
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("i"));
    expect(hits).toEqual(["send", "inbox"]);
  });

  it("named keys fire in either case, spelled as KeyboardEvent.key spells them or in lower case", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Insert: on("insert"), printscreen: on("print"), " ": on("space") });
    for (const k of ["Insert", "PrintScreen", " "]) kb.handleKeydown(key(k));
    expect(hits).toEqual(["insert", "print", "space"]);
  });

  it("a lower-case key name nobody knows throws, instead of never firing", () => {
    const { kb, on } = rig();
    expect(() => kb.pushLayer({ mediaplaypause: on("play") })).toThrow(/mediaplaypause/);
    expect(() => kb.pushLayer({ MediaPlayPause: on("play") })).not.toThrow();
  });

  it("two spellings of one key throw, in a layer and in the registered map alike", () => {
    const { kb, on, run } = rig();
    expect(() => kb.pushLayer({ Escape: on("a"), esc: on("b") })).toThrow(/Escape.*twice/);
    const map = new Map([
      ["Escape", cmd("a", "Escape")],
      ["esc", cmd("b", "esc")],
    ]);
    expect(() => kb.registerShortcuts(map, { onActivate: run })).toThrow(/Escape.*twice/);
  });
});

describe("L11 chords obey the barrier", () => {
  it("a prefix bound only below a modal does not arm", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "g i": on("inbox") });
    kb.pushLayer({}, { modal: true });
    kb.handleKeydown(key("g"));
    expect(kb.chordPrefix).toBeNull();
    expect(kb.chordCompletions("g")).toEqual([]);
    kb.handleKeydown(key("i"));
    expect(hits).toEqual([]);
  });

  it("a chord armed above does not complete with a second key bound only below the barrier", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "g i": on("inbox") });
    kb.pushLayer({ "g x": on("x") }, { modal: true });
    kb.handleKeydown(key("g"));
    expect(kb.chordPrefix).toBe("g");
    expect(kb.chordCompletions().map((c) => c.shortcut)).toEqual(["g x"]);
    kb.handleKeydown(key("i"));
    expect(hits).toEqual([]);
  });
});
