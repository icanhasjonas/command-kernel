/**
 * THE LAYER LAWS, part 1 of 3: the ORDER of the stack (L1-L6, L17). Each `describe` is the law of
 * the same number in docs/keyboard.md ("Layers"); `test/docs-keyboard.test.ts` fails the build
 * when the doc and these blocks disagree. Parts 2 and 3: keyboard-laws-keys / -scopes.test.ts.
 */

import { describe, expect, it } from "bun:test";
import { cmd, key, mod, modKey, rig, testCtx } from "./keyboard.test-util.js";

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

  it("a chord whose every command is hidden (when) does not arm, so the key underneath runs", () => {
    const { kb, hits, run } = rig();
    kb.registerShortcuts(new Map([["g", cmd("base g", "g")]]), { onActivate: run });
    const b = kb.bindScopes({
      nodes: [
        cmd("hidden inbox", "g i", { scope: "panel", when: () => false }),
        cmd("own g", "h", { scope: "panel" }),
        cmd("hidden help", "h i", { scope: "panel", when: () => false }),
      ],
      scopes: [],
      mounted: ["panel"],
      ctx: () => testCtx,
      activeScopes: () => [],
      onActivate: run,
    });
    b.mount("panel");
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("h"));
    expect(hits).toEqual(["base g", "own g"]);
    expect(kb.chordPrefix).toBeNull();
  });
});

describe("L1 a key that completes no chord cancels it and runs as itself", () => {
  /** `g r` is a chord; `c`, `mod+enter` and `mod+k` are plain keys; `h i` is another chord */
  function chords() {
    const r = rig();
    r.kb.registerShortcuts(
      new Map([
        ["g r", cmd("reply", "g r")],
        ["c", cmd("compose", "c")],
        ["mod+enter", cmd("send", "mod+enter")],
        ["mod+k", cmd("palette", "mod+k")],
        ["h i", cmd("help", "h i")],
        ["Escape", cmd("close", "Escape")],
      ]),
      { onActivate: r.run },
    );
    return r;
  }

  it("g then c runs the node bound to c", () => {
    const { kb, hits } = chords();
    kb.handleKeydown(key("g"));
    const c = key("c");
    kb.handleKeydown(c);
    expect(hits).toEqual(["compose"]);
    expect(c.prevented).toBe(true);
    expect(kb.chordPrefix).toBeNull();
  });

  it("g then mod+enter runs mod+enter's node", () => {
    const { kb, hits } = chords();
    kb.handleKeydown(key("g"));
    kb.handleKeydown(modKey("Enter"));
    expect(hits).toEqual(["send"]);
    expect(kb.chordPrefix).toBeNull();
  });

  it("g then mod+k runs mod+k's node", () => {
    const { kb, hits } = chords();
    kb.handleKeydown(key("g"));
    kb.handleKeydown(modKey("k"));
    expect(hits).toEqual(["palette"]);
  });

  it("g then a key that is itself a chord prefix arms that prefix", () => {
    const { kb, hits } = chords();
    kb.handleKeydown(key("g"));
    const h = key("h");
    kb.handleKeydown(h);
    expect(kb.chordPrefix).toBe("h");
    expect(h.prevented).toBe(true);
    kb.handleKeydown(key("i"));
    expect(hits).toEqual(["help"]);
  });

  it("a real completion still runs the chord and not the second key alone: g r is reply", () => {
    const { kb, hits, run } = chords();
    kb.registerShortcuts(new Map([["r", cmd("plain r", "r")]]), { onActivate: run });
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("r"));
    expect(hits).toEqual(["reply"]);
    expect(kb.chordPrefix).toBeNull();
  });

  it("a chord that IS bound but declines ends there: its last key never runs alone", () => {
    // gate-mail, 5 Oct 2026: `g a` (Go to Account) refused on live mail ran `a`, Reply all
    const { kb, hits, run } = rig();
    kb.registerShortcuts(new Map([["a", cmd("reply all", "a")]]), { onActivate: run });
    const b = kb.bindScopes({
      nodes: [cmd("account", "g a", { scope: "panel", disabled: () => "Not on live mail" })],
      scopes: [],
      mounted: ["panel"],
      ctx: () => testCtx,
      activeScopes: () => [],
      onActivate: run,
    });
    b.mount("panel");
    const declined: string[] = [];
    kb.onDeclined((binding) => declined.push(binding));
    kb.handleKeydown(key("g"));
    const a = key("a");
    kb.handleKeydown(a);
    expect(hits).toEqual([]);
    expect(declined).toEqual(["g a"]);
    // taken, so the browser does not act on it either
    expect(a.prevented).toBe(true);
    expect(kb.chordPrefix).toBeNull();
    // and a alone is still Reply all
    kb.handleKeydown(key("a"));
    expect(hits).toEqual(["reply all"]);
  });

  it("a declining handler on a chord hands it to a lower layer's same chord, never the last key", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "g a": on("lower g a"), a: on("a alone") });
    kb.pushLayer({ "g a": () => false });
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("a"));
    expect(hits).toEqual(["lower g a"]);
  });

  it("in a field, a printable key that completes no chord is left to the field", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "mod+k p": on("people"), c: on("compose") });
    const field = { target: { tagName: "INPUT" } };
    kb.handleKeydown(key("k", { ...mod, ...field }));
    expect(kb.chordPrefix).toBe("mod+k");
    const c = key("c", field);
    kb.handleKeydown(c);
    expect(hits).toEqual([]);
    expect(c.prevented).toBe(false);
    expect(kb.chordPrefix).toBeNull();
  });

  it("Escape only cancels the chord: the Escape binding does not run", () => {
    const { kb, hits } = chords();
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual([]);
    expect(kb.chordPrefix).toBeNull();
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["close"]);
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

  it("otherwise the one opened last is on top: a menu opened in a dialog after a toast beats it", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ x: on("dialog") }, { id: "dialog" });
    const toast = kb.pushLayer({ x: on("toast") }, { id: "toast" });
    kb.pushLayer({ x: on("menu in dialog") }, { id: "menu", parent: "dialog" });
    kb.handleKeydown(key("x"));
    kb.popLayer(toast);
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["menu in dialog", "menu in dialog"]);
  });

  it("a modal editor opened in an older screen is above a toast that appeared before it", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({}, { id: "screen" });
    kb.pushLayer({ Escape: on("dismiss toast"), z: on("undo") }, { id: "toast" });
    kb.pushLayer({ Escape: on("discard") }, { id: "editor", parent: "screen", modal: true });
    kb.handleKeydown(key("Escape"));
    kb.handleKeydown(key("z"));
    expect(hits).toEqual(["discard"]);
  });

  it("siblings under one parent stack in push order", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({}, { id: "dialog" });
    kb.pushLayer({ x: on("first") }, { parent: "dialog" });
    kb.pushLayer({ x: on("second") }, { parent: "dialog" });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["second"]);
  });

  it("a child whose owner was popped keeps its place; only something opened later goes above it", () => {
    const { kb } = rig();
    const ids = () => kb.describeStack().layers.map((l) => l.id);
    kb.pushLayer({}, { id: "toast" });
    const dialog = kb.pushLayer({}, { id: "dialog" });
    kb.pushLayer({}, { id: "popover", parent: "dialog" });
    kb.pushLayer({}, { id: "banner" });
    kb.popLayer(dialog);
    kb.pushLayer({}, { id: "app", base: true });
    expect(ids()).toEqual(["banner", "popover", "toast", "app"]);
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

  it("an orphan keeps its tier with its place: an owned base layer stays above the screen", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ x: on("screen") }, { id: "screen" });
    const dialog = kb.pushLayer({}, { id: "dialog" });
    kb.pushLayer({ x: on("owned") }, { parent: "dialog", base: true });
    kb.popLayer(dialog);
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["owned"]);
  });

  it("an explicit id that looks like a default one never makes a later default push throw", () => {
    const { kb } = rig();
    for (let i = 0; i < 4; i++) kb.pushLayer({}, { id: `layer-${i}` });
    expect(() => kb.pushLayer({})).not.toThrow();
  });

  it("modal layers are windows: suggestions opening late in the editor stay under a newer palette", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("discard") }, { id: "editor", modal: true });
    kb.pushLayer({ Escape: on("close palette") }, { id: "palette", modal: true });
    kb.pushLayer({ Escape: on("close suggestions") }, { id: "sugg", parent: "editor" });
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["close palette"]);
    expect(kb.describeStack().layers.map((l) => l.id)).toEqual(["palette", "sugg", "editor"]);
  });

  it("a plain layer shown while a modal is open belongs under it: a toast's keys do not cross", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("discard") }, { id: "editor", modal: true });
    kb.pushLayer({ u: on("undo"), Escape: on("dismiss") }, { id: "toast" });
    kb.handleKeydown(key("u"));
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["discard"]);
  });

  it("a modal mounted in the same commit as a deep sibling subtree (children first) is on top", () => {
    const { kb } = rig();
    kb.pushLayer({}, { id: "g", parent: "x" });
    kb.pushLayer({}, { id: "x", parent: "a" });
    kb.pushLayer({}, { id: "a" });
    kb.pushLayer({}, { id: "b", modal: true });
    expect(kb.describeStack().layers[0]?.id).toBe("b");
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

  it("a layer popped by a handler during the press does not run", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ x: on("bottom") });
    const mid = kb.pushLayer({ x: on("mid (popped)") });
    kb.pushLayer({
      x: () => {
        kb.popLayer(mid);
        return false;
      },
    });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["bottom"]);
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

  it("switching an owner off switches off what it holds: a closing editor's suggestions take nothing", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("back") }, { id: "screen" });
    const editor = kb.pushLayer({ Escape: on("discard") }, { id: "editor", modal: true });
    kb.pushLayer(
      { Enter: on("pick suggestion"), Escape: on("close suggestions") },
      { parent: "editor" },
    );
    kb.updateLayer(editor, { options: { enabled: false } });
    kb.handleKeydown(key("Enter"));
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["back"]);
    expect(kb.describeStack().reachable.map((r) => r.binding)).toEqual(["Escape"]);
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

  it("passThrough is checked when the layer is pushed: an unknown key name throws there", () => {
    const { kb } = rig();
    expect(() => kb.pushLayer({}, { modal: true, passThrough: ["mediaplaypause"] })).toThrow(
      /mediaplaypause/,
    );
  });

  it("a chord crosses a barrier only when passThrough names the whole sequence", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "g i": on("inbox"), "g s": on("sent") });
    kb.pushLayer({}, { modal: true, passThrough: ["g i"] });
    for (const k of ["g", "s", "g", "i"]) kb.handleKeydown(key(k));
    expect(hits).toEqual(["inbox"]);
  });
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
    expect(kb.describeStack().layers.map((l) => [l.id, l.parent])).toEqual([
      ["top", undefined],
      ["child", "a"],
      ["b", undefined],
      ["a", undefined],
    ]);
    kb.updateLayer(child, { options: { parent: undefined } });
    expect(kb.describeStack().layers[0]?.id).toBe("top");
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["top"]);
  });

  it("new bindings on a node layer forget the nodes the old ones ran", () => {
    const { kb, run } = rig();
    const map = kb.registerShortcuts(new Map([["j", cmd("next", "j")]]), { onActivate: run });
    kb.updateLayer(map, { bindings: { j: () => {} } });
    expect(kb.describeStack().reachable[0]?.node).toBeUndefined();
  });

  it("an update that cannot apply changes nothing: bindings and options go in together or not at all", () => {
    const { kb, on } = rig();
    const layer = kb.pushLayer({ j: on("j") }, { modal: true });
    const before = kb.stackVersion;
    expect(() =>
      kb.updateLayer(layer, {
        bindings: { k: on("k") },
        options: { passThrough: ["mediaplaypause"] },
      }),
    ).toThrow(/mediaplaypause/);
    expect(Object.keys(layer.bindings)).toEqual(["j"]);
    expect(kb.stackVersion).toBe(before);
  });

  it("an update to base moves the layer to its new tier", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ x: on("overlay") });
    const app = kb.pushLayer({ x: on("app") }, { base: true });
    kb.handleKeydown(key("x"));
    kb.updateLayer(app, { options: { base: undefined } });
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["overlay", "app"]);
  });
});
