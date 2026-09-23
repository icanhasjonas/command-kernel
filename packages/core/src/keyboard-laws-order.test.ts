/**
 * THE LAYER LAWS, part 1 of 3: the ORDER of the stack (L1-L6, L17). Each `describe` is the law of
 * the same number in docs/keyboard.md ("Layers"); `test/docs-keyboard.test.ts` fails the build
 * when the doc and these blocks disagree. Parts 2 and 3: keyboard-laws-keys / -scopes.test.ts.
 */

import { describe, expect, it } from "bun:test";
import { cmd, key, modKey, rig, testCtx } from "./keyboard.test-util.js";

describe("L1 the nearest live layer that knows a key takes it", () => {
  it("later wins, and a pop hands the key back", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("screen") });
    const dialog = kb.pushLayer({ Escape: on("dialog") });
    kb.handleKeydown(key("Escape"));
    kb.popLayer(dialog);
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["dialog", "screen"]);
  });

  it("a chord prefix bound BELOW does not take a single key bound above", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "g i": on("inbox") });
    kb.pushLayer({ g: on("top g") });
    kb.handleKeydown(key("g"));
    expect(kb.chordPrefix).toBeNull();
    expect(hits).toEqual(["top g"]);
  });

  it("a chord ABOVE arms over a single key below; a declined key lets a lower chord arm", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ g: on("below g"), "h i": on("help") });
    kb.pushLayer({ "g i": on("inbox"), h: () => false });
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("i"));
    kb.handleKeydown(key("h"));
    kb.handleKeydown(key("i"));
    expect(hits).toEqual(["inbox", "help"]);
  });

  it("in ONE layer, a chord beats a single key on the same first key", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ g: on("g"), "g i": on("inbox") });
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("i"));
    expect(hits).toEqual(["inbox"]);
  });

  it("the same rule at every step of a longer chord", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "g i": on("low g i") });
    kb.pushLayer({ "g i x": on("g i x") });
    for (const k of ["g", "i", "x"]) kb.handleKeydown(key(k));
    expect(hits).toEqual(["g i x"]);
  });
});

describe("L2 base layers sit below every other layer, whenever they were pushed", () => {
  it("a base layer pushed last is still under an overlay pushed first", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ j: on("overlay") });
    kb.pushLayer({ j: on("app") }, { base: true });
    kb.handleKeydown(key("j"));
    expect(hits).toEqual(["overlay"]);
  });

  it("the registered shortcut map sits below the facts scopes, registered before or after", () => {
    for (const mapFirst of [true, false]) {
      const { kb, hits, run } = rig();
      const map = () =>
        kb.registerShortcuts(new Map([["Escape", cmd("close all", "Escape")]]), {
          onActivate: run,
        });
      const scopes = () =>
        kb.bindScopes({
          nodes: [cmd("discard", "Escape", { scope: "editor" })],
          scopes: ["editor"],
          ctx: () => testCtx,
          activeScopes: () => ["editor"],
          onActivate: run,
        });
      for (const step of mapFirst ? [map, scopes] : [scopes, map]) step();
      kb.handleKeydown(key("Escape"));
      expect(hits).toEqual(["discard"]);
    }
  });
});

describe("L3 a layer sits above its owner, whatever order the two were pushed in", () => {
  it("a child pushed BEFORE its parent (React runs child effects first) still wins", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("screen") });
    kb.pushLayer({ Escape: on("popover") }, { id: "popover", parent: "dialog" });
    kb.pushLayer({ Escape: on("dialog") }, { id: "dialog" });
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["popover"]);
  });

  it("a subtree stays together: a later sibling of the parent is above all of it", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ x: on("dialog") }, { id: "dialog" });
    kb.pushLayer({ x: on("toast") }, { id: "toast" });
    kb.pushLayer({ x: on("menu in dialog") }, { id: "menu", parent: "dialog" });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["toast"]);
  });

  it("siblings under one parent stack in push order", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({}, { id: "dialog" });
    kb.pushLayer({ x: on("first") }, { parent: "dialog" });
    kb.pushLayer({ x: on("second") }, { parent: "dialog" });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["second"]);
  });

  it("a child whose owner was popped keeps its place: a later push does not lift it", () => {
    const { kb, hits, on } = rig();
    const dialog = kb.pushLayer({}, { id: "dialog" });
    kb.pushLayer({ x: on("toast") }, { id: "toast" });
    kb.pushLayer({ x: on("popover") }, { id: "popover", parent: "dialog" });
    kb.popLayer(dialog);
    kb.pushLayer({}, { base: true });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["toast"]);
  });

  it("ownership beats base: a base layer owned by an overlay sits above that overlay", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ x: on("dialog") }, { id: "dialog" });
    kb.pushLayer({ x: on("owned") }, { parent: "dialog", base: true });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["owned"]);
  });

  it("two live layers cannot share an id; a popped id is free, and default ids never repeat", () => {
    const { kb } = rig();
    const menu = kb.pushLayer({}, { id: "menu" });
    expect(() => kb.pushLayer({}, { id: "menu" })).toThrow(/"menu" is already on the stack/);
    kb.popLayer(menu);
    expect(kb.pushLayer({}, { id: "menu" }).id).toBe("menu");
    const a = kb.pushLayer({});
    kb.popLayer(a);
    expect(kb.pushLayer({}).id).not.toBe(a.id);
  });
});

describe("L4 a handler that returns false declines, and the key goes on down", () => {
  it("the layer below gets the key", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Enter: on("below") });
    kb.pushLayer({ Enter: () => false });
    kb.handleKeydown(key("Enter"));
    expect(hits).toEqual(["below"]);
  });

  it("a declining handler that changes the stack does not make the press skip a layer", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ x: on("bottom") });
    kb.pushLayer({ x: on("mid") });
    kb.pushLayer({
      x: () => {
        kb.pushLayer({}, { base: true });
        return false;
      },
    });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["mid"]);
  });
});

describe("L5 a live modal layer is a barrier: what it does not take stops there", () => {
  it("a key the dialog does not bind never reaches the screen, and is not cancelled", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ j: on("next thread") });
    kb.pushLayer({ Escape: on("close") }, { modal: true });
    const j = key("j");
    kb.handleKeydown(j);
    expect(hits).toEqual([]);
    expect(j.prevented).toBe(false);
  });

  it("a key the dialog declines stops at the barrier too", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Enter: on("open thread") });
    kb.pushLayer({ Enter: () => false }, { modal: true });
    kb.handleKeydown(key("Enter"));
    expect(hits).toEqual([]);
  });

  it("layers above the barrier still work, and a disabled modal is no barrier", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ j: on("screen") });
    const dialog = kb.pushLayer({}, { id: "dialog", modal: true });
    kb.pushLayer({ ArrowDown: on("suggestion") }, { parent: "dialog" });
    kb.handleKeydown(key("ArrowDown"));
    kb.updateLayer(dialog, { options: { enabled: false } });
    kb.handleKeydown(key("j"));
    expect(hits).toEqual(["suggestion", "screen"]);
  });
});

describe("L6 passThrough keys cross a modal barrier", () => {
  for (const spelling of ["Mod+K", "cmd+k"]) {
    it(`mod+k opens the palette from inside a dialog, written ${spelling}`, () => {
      const { kb, hits, on } = rig();
      kb.pushLayer({ "mod+k": on("palette"), j: on("next") });
      kb.pushLayer({}, { modal: true, passThrough: [spelling] });
      kb.handleKeydown(modKey("k"));
      kb.handleKeydown(key("j"));
      expect(hits).toEqual(["palette"]);
    });
  }
});

describe("L17 updating a layer keeps its place", () => {
  it("new bindings and options apply in place, still below a layer pushed after it", () => {
    const { kb, hits, on } = rig();
    const dialog = kb.pushLayer({ Escape: on("dialog") }, { id: "dialog", modal: true });
    kb.pushLayer({ Escape: on("palette") }, { id: "palette", modal: true });
    kb.updateLayer(dialog, { bindings: { Escape: on("dialog 2"), r: on("reply") } });
    kb.updateLayer(dialog, { options: { passThrough: ["mod+k"] } });
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["palette"]);
    expect(kb.describeStack().layers.map((l) => [l.id, l.keys.join(" ")])).toEqual([
      ["palette", "Escape"],
      ["dialog", "Escape r"],
    ]);
  });

  it("a new owner, or none, moves a layer into that owner's subtree and nowhere else", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({}, { id: "a" });
    kb.pushLayer({}, { id: "b" });
    const child = kb.pushLayer({ x: on("child") }, { id: "child", parent: "b" });
    kb.pushLayer({ x: on("top") }, { id: "top" });
    kb.updateLayer(child, { options: { parent: "a" } });
    expect(kb.describeStack().layers.map((l) => l.id)).toEqual(["top", "b", "child", "a"]);
    kb.updateLayer(child, { options: { parent: undefined } });
    expect(kb.describeStack().layers[0]?.id).toBe("top");
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["top"]);
  });
});
