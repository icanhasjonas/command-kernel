/**
 * THE LAYER LAWS. Each `describe` is one numbered law of docs/keyboard.md ("Layers"; L15, the
 * listener, is tested in @command-kernel/react where it lives), and
 * `docs-keyboard.test.ts` fails the build when the doc names a law this file does not test.
 * Change a law here and there together.
 */

import { describe, expect, it } from "bun:test";
import { createKeyboard } from "./keyboard.js";
import { key, modKey } from "./keyboard.test-util.js";
import type { CommandNode, Ctx } from "./types.js";

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

const node = (id: string, shortcut: string, extra: Partial<CommandNode> = {}): CommandNode => ({
  id,
  title: id,
  shortcut,
  ...extra,
});

/** a keyboard and a log; `on(name)` is a handler that logs `name` */
function rig() {
  const kb = createKeyboard();
  const hits: string[] = [];
  const on = (name: string) => () => {
    hits.push(name);
  };
  return { kb, hits, on };
}

describe("L1 the top live layer takes the key; popping it restores the one below", () => {
  it("later wins, and a pop hands the key back", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("screen") });
    const dialog = kb.pushLayer({ Escape: on("dialog") });
    kb.handleKeydown(key("Escape"));
    kb.popLayer(dialog);
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["dialog", "screen"]);
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
});

describe("L3 a layer sits above its parent, whatever order the two were pushed in", () => {
  it("a child pushed BEFORE its parent (React runs child effects first) still wins", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("screen") });
    kb.pushLayer({ Escape: on("popover") }, { id: "popover", parent: "dialog" });
    kb.pushLayer({ Escape: on("dialog") }, { id: "dialog" });
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["popover"]);
  });

  it("a parent's whole subtree stays together: a later sibling of the parent is above it", () => {
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

  it("default ids never collide after a pop, so a parent id always means one layer", () => {
    const { kb } = rig();
    const a = kb.pushLayer({});
    kb.pushLayer({});
    kb.popLayer(a);
    const c = kb.pushLayer({});
    const ids = kb.describeStack().layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(c.id);
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
    dialog.options.enabled = false;
    kb.handleKeydown(key("j"));
    expect(hits).toEqual(["suggestion", "screen"]);
  });
});

describe("L6 passThrough keys cross a modal barrier", () => {
  it("mod+k opens the palette from inside a dialog, in any spelling", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "mod+k": on("palette"), j: on("next") });
    kb.pushLayer({}, { modal: true, passThrough: ["Mod+K"] });
    kb.handleKeydown(modKey("k"));
    kb.handleKeydown(key("j"));
    expect(hits).toEqual(["palette"]);
  });
});

describe("L7 a widget comes first: a press it already handled is never offered", () => {
  it("defaultPrevented keeps the stack out of it", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ ArrowDown: on("next thread") });
    kb.handleKeydown(key("ArrowDown", { defaultPrevented: true }));
    expect(hits).toEqual([]);
  });
});

describe("L8 typing beats commanding, on every layer", () => {
  it("a bare letter typed in a field never fires, even on the top layer", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ c: on("copies") }, { modal: true });
    kb.handleKeydown(key("c", { target: { tagName: "INPUT" } }));
    expect(hits).toEqual([]);
  });
});

describe("L9 a key pressed while an IME is composing is never a command", () => {
  it("isComposing, and Safari's keyCode 229, are left to the input method", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Enter: on("send"), Escape: on("close") });
    kb.handleKeydown(key("Enter", { isComposing: true }));
    kb.handleKeydown(key("Escape", { keyCode: 229 }));
    expect(hits).toEqual([]);
  });
});

describe("L10 a layer's keys are canonical: any spelling fires on the press", () => {
  it("mod+enter, Mod+Enter and a chord typed with capitals all bind", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "mod+enter": on("send"), "G I": on("inbox") });
    kb.handleKeydown(modKey("Enter"));
    kb.handleKeydown(key("g"));
    kb.handleKeydown(key("i"));
    expect(hits).toEqual(["send", "inbox"]);
  });
});

describe("L11 chords obey the barrier", () => {
  it("a prefix bound only below a modal neither arms nor completes", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ "g i": on("inbox") });
    kb.pushLayer({}, { modal: true });
    kb.handleKeydown(key("g"));
    expect(kb.chordPrefix).toBeNull();
    expect(kb.chordCompletions("g")).toEqual([]);
    kb.handleKeydown(key("i"));
    expect(hits).toEqual([]);
  });
});

describe("L12 context scopes stay under overlays, even when rebound", () => {
  it("bindScopes after a dialog opened still loses the key to the dialog", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("dialog") }, { modal: true });
    kb.bindScopes({
      nodes: [node("back", "Escape", { scope: "thread" })],
      scopes: ["thread"],
      ctx: () => ctx,
      activeScopes: () => ["thread"],
      onActivate: (n) => hits.push(n.id),
    });
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["dialog"]);
  });
});

describe("L13 a mounted scope puts its commands on the stack until popped", () => {
  const nodes = [
    node("back", "Escape", { scope: "thread" }),
    node("discard", "Escape", { scope: "dialog" }),
    node("send", "mod+Enter", { scope: "dialog", disabled: () => "Add a recipient first" }),
  ];
  const setup = () => {
    const { kb, hits } = rig();
    const said: string[] = [];
    const binding = kb.bindScopes({
      nodes,
      scopes: ["thread"],
      mounted: ["dialog"],
      ctx: () => ctx,
      activeScopes: () => ["thread"],
      onActivate: (n) => hits.push(n.id),
      onDisabled: (_n, reason) => said.push(reason),
    });
    return { kb, hits, said, binding };
  };

  it("mounted, it wins and says why a disabled command did not run; popped, it is gone", () => {
    const { kb, hits, said, binding } = setup();
    const layer = binding.mount("dialog", { modal: true });
    kb.handleKeydown(key("Escape"));
    kb.handleKeydown(modKey("Enter"));
    kb.popLayer(layer);
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["discard", "back"]);
    expect(said).toEqual(["Add a recipient first"]);
  });

  it("a mounted scope is not live until mounted", () => {
    const { kb, hits } = setup();
    kb.handleKeydown(modKey("Enter"));
    expect(hits).toEqual([]);
  });

  it("disposing the binding pops its mounted layers too", () => {
    const { kb, hits, binding } = setup();
    binding.mount("dialog");
    binding.dispose();
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual([]);
    expect(kb.describeStack().layers).toEqual([]);
  });

  it("mounting a scope that was not declared as mounted throws", () => {
    const { binding } = setup();
    expect(() => binding.mount("thread")).toThrow(/not declared as mounted/);
  });
});

describe("L14 describeStack says what a press would reach, top first", () => {
  it("lists layers top first and the reachable keys, barrier and passThrough respected", () => {
    const { kb, on } = rig();
    kb.pushLayer({ j: on("next"), "mod+k": on("palette") }, { id: "screen", base: true });
    kb.pushLayer({ Escape: on("close") }, { id: "dialog", modal: true, passThrough: ["mod+k"] });
    const { layers, reachable } = kb.describeStack();
    expect(layers.map((l) => [l.id, l.live, l.modal])).toEqual([
      ["dialog", true, true],
      ["screen", true, false],
    ]);
    expect(reachable.map((r) => [r.binding, r.layerId])).toEqual([
      ["Escape", "dialog"],
      ["mod+k", "screen"],
    ]);
  });
});

describe("L16 subscribeStack hears every push and pop", () => {
  it("once per change, until unsubscribed", () => {
    const { kb } = rig();
    let heard = 0;
    const off = kb.subscribeStack(() => {
      heard++;
    });
    const layer = kb.pushLayer({});
    kb.popLayer(layer);
    off();
    kb.pushLayer({});
    expect(heard).toBe(2);
  });
});
