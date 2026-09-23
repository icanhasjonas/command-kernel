/**
 * THE LAYER LAWS, part 3 of 3: scopes and the stack as data (L12-L14, L16). Each `describe` is
 * the law of the same number in docs/keyboard.md ("Layers").
 */

import { describe, expect, it } from "bun:test";
import { cmd, key, modKey, rig, testCtx } from "./keyboard.test-util.js";
import type { CommandNode } from "./types.js";

/** `bindScopes` over `nodes` with facts scope "thread" (always live) and mounted scope "dialog" */
function scoped(nodes: CommandNode[]) {
  const r = rig();
  const said: string[] = [];
  let builds = 0;
  const binding = r.kb.bindScopes({
    nodes,
    scopes: ["thread"],
    mounted: ["dialog"],
    ctx: () => {
      builds++;
      return testCtx;
    },
    activeScopes: () => ["thread"],
    onActivate: r.run,
    onDisabled: (_n, reason) => said.push(reason),
  });
  return { ...r, said, binding, builds: () => builds };
}

describe("L12 facts scopes stay under overlays; setNodes rebinds in place", () => {
  it("a scope bound after a dialog opened still loses the key to the dialog", () => {
    const { kb, hits, on } = rig();
    kb.pushLayer({ Escape: on("dialog") }, { modal: true });
    kb.bindScopes({
      nodes: [cmd("back", "Escape", { scope: "thread" })],
      scopes: ["thread"],
      ctx: () => testCtx,
      activeScopes: () => ["thread"],
      onActivate: () => {},
    });
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["dialog"]);
  });

  it("setNodes swaps every scope's commands, mounted ones included, moving nothing, telling once", () => {
    const { kb, hits, on, binding } = scoped([cmd("back", "Escape", { scope: "thread" })]);
    const dialog = binding.mount("dialog", { modal: true });
    const palette = kb.pushLayer({ Escape: on("palette") }, { id: "palette", modal: true });
    let told = 0;
    kb.subscribeStack(() => {
      told++;
    });
    binding.setNodes([
      cmd("back", "Escape", { scope: "thread" }),
      cmd("send", "mod+Enter", { scope: "dialog" }),
    ]);
    expect(told).toBe(1);
    kb.handleKeydown(key("Escape"));
    kb.popLayer(palette);
    kb.handleKeydown(modKey("Enter"));
    expect(hits).toEqual(["palette", "send"]);
    expect(kb.describeStack().layers.map((l) => l.id)).toEqual([
      dialog.id,
      binding.layers[0]?.id ?? "",
    ]);
  });

  it("a second binding of the same scopes, and a second registered map, do not throw", () => {
    const { kb, run } = rig();
    const bind = () =>
      kb.bindScopes({
        nodes: [cmd("back", "Escape", { scope: "thread" })],
        scopes: ["thread"],
        ctx: () => testCtx,
        activeScopes: () => ["thread"],
        onActivate: run,
      });
    const map = () => kb.registerShortcuts(new Map([["j", cmd("next", "j")]]), { onActivate: run });
    expect(() => {
      bind();
      bind();
      map();
      map();
    }).not.toThrow();
  });

  it("a binding that fails part-way leaves nothing on the stack", () => {
    const { kb } = rig();
    expect(() =>
      kb.bindScopes({
        nodes: [cmd("next", "j", { scope: "one" }), cmd("down", "pgdn", { scope: "two" })],
        scopes: ["one", "two"],
        ctx: () => testCtx,
        activeScopes: () => ["one", "two"],
        onActivate: () => {},
      }),
    ).toThrow(/pgdn/);
    expect(kb.describeStack().layers).toEqual([]);
  });

  it("setNodes that fails part-way changes nothing and tells nobody", () => {
    const { kb, hits, binding } = scoped([cmd("back", "Escape", { scope: "thread" })]);
    binding.mount("dialog");
    let told = 0;
    kb.subscribeStack(() => {
      told++;
    });
    expect(() =>
      binding.setNodes([
        cmd("back 2", "Escape", { scope: "thread" }),
        cmd("down", "pgdn", { scope: "dialog" }),
      ]),
    ).toThrow(/pgdn/);
    binding.mount("dialog");
    expect(told).toBe(1);
    // still the OLD commands: "back", never "back 2"
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["back"]);
    expect(kb.describeStack().reachable.map((r) => r.node?.id)).toEqual(["back"]);
  });

  it("a host id that looks like a generated one never makes binding throw", () => {
    const { kb } = rig();
    for (let i = 0; i < 4; i++) kb.pushLayer({}, { id: `scope:thread:${i}` });
    expect(() =>
      kb.bindScopes({
        nodes: [],
        scopes: ["thread"],
        ctx: () => testCtx,
        activeScopes: () => [],
        onActivate: () => {},
      }),
    ).not.toThrow();
  });
});

describe("L13 a mounted scope puts its commands on the stack until popped", () => {
  const nodes = [
    cmd("back", "Escape", { scope: "thread" }),
    cmd("discard", "Escape", { scope: "dialog" }),
    cmd("send", "mod+Enter", { scope: "dialog", disabled: () => "Add a recipient first" }),
  ];

  it("mounted, it wins and says why a disabled command did not run; popped, it is gone", () => {
    const { kb, hits, said, binding } = scoped(nodes);
    const layer = binding.mount("dialog", { modal: true });
    kb.handleKeydown(key("Escape"));
    kb.handleKeydown(modKey("Enter"));
    kb.popLayer(layer);
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["discard", "back"]);
    expect(said).toEqual(["Add a recipient first"]);
  });

  it("not live until mounted: Escape goes back until the dialog mounts, then discards", () => {
    const { kb, hits, binding } = scoped(nodes);
    kb.handleKeydown(key("Escape"));
    binding.mount("dialog");
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["back", "discard"]);
  });

  it("dispose pops mounted layers too, and a disposed binding mounts nothing", () => {
    const { kb, hits, binding } = scoped(nodes);
    binding.mount("dialog");
    binding.dispose();
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual([]);
    expect(kb.describeStack().layers).toEqual([]);
    expect(() => binding.mount("dialog")).toThrow(/disposed/);
  });

  it("an undeclared scope cannot be mounted, and mounted ids never repeat across bindings", () => {
    const { kb, binding } = scoped(nodes);
    expect(() => binding.mount("thread")).toThrow(/not declared as mounted/);
    const other = kb.bindScopes({
      nodes: [],
      scopes: [],
      mounted: ["dialog"],
      ctx: () => testCtx,
      activeScopes: () => [],
      onActivate: () => {},
    });
    expect(other.mount("dialog").id).not.toBe(binding.mount("dialog").id);
  });

  it("createScopes pushes nothing until attach; mount works before; detach takes the facts off", () => {
    const { kb, hits, run } = rig();
    const b = kb.createScopes({
      nodes: [
        cmd("back", "Escape", { scope: "thread" }),
        cmd("discard", "Escape", { scope: "dialog" }),
      ],
      scopes: ["thread"],
      mounted: ["dialog"],
      ctx: () => testCtx,
      activeScopes: () => ["thread"],
      onActivate: run,
    });
    expect(kb.describeStack().layers).toEqual([]);
    const dialog = b.mount("dialog");
    b.attach();
    b.attach();
    kb.popLayer(dialog);
    kb.handleKeydown(key("Escape"));
    b.detach();
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["back"]);
    expect(kb.describeStack().layers).toEqual([]);
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

  it("reads facts fresh outside a key press, building the ctx once per description", () => {
    const { kb } = rig();
    let facts: Record<string, string> = { scopes: "list" };
    let builds = 0;
    kb.bindScopes({
      nodes: [cmd("next", "j", { scope: "list" }), cmd("reply", "r", { scope: "thread" })],
      scopes: ["list", "thread"],
      ctx: () => {
        builds++;
        return { ...testCtx, facts };
      },
      activeScopes: (c) => String(c.facts?.scopes).split(" "),
      onActivate: () => {},
    });
    kb.handleKeydown(key("x"));
    facts = { scopes: "thread" };
    builds = 0;
    expect(kb.describeStack().reachable.map((r) => r.binding)).toEqual(["r"]);
    expect(builds).toBe(1);
  });

  it("agrees with real presses on chords of any length", () => {
    // [the keys of each layer, bottom first], and the bindings a press can actually reach
    const cases: Array<[string[][], string[]]> = [
      [[["g i"], ["g i x"]], ["g i x"]],
      [[["g i", "g i x"]], ["g i x"]],
      [[["g i x"], ["g i"]], ["g i"]],
      [[["g"], ["g i"]], ["g i"]],
      [[["g i"], ["g"]], ["g"]],
    ];
    for (const [stack, want] of cases) {
      const { kb, hits, on } = rig();
      for (const keys of stack) kb.pushLayer(Object.fromEntries(keys.map((k) => [k, on(k)])));
      const reachable = kb.describeStack().reachable.map((r) => r.binding);
      expect(reachable).toEqual(want);
      for (const binding of reachable) {
        hits.length = 0;
        for (const step of binding.split(" ")) kb.handleKeydown(key(step));
        expect(hits).toEqual([binding]);
      }
    }
  });

  it("a command that would decline is not reachable; the key goes on to what a press reaches", () => {
    const { kb, run } = rig();
    kb.registerShortcuts(new Map([["g i", cmd("inbox", "g i")]]), { onActivate: run });
    kb.bindScopes({
      nodes: [cmd("go", "g", { scope: "list", when: () => false })],
      scopes: ["list"],
      ctx: () => testCtx,
      activeScopes: () => ["list"],
      onActivate: run,
    });
    expect(kb.describeStack().reachable.map((r) => r.binding)).toEqual(["g i"]);
    kb.handleKeydown(key("g"));
    expect(kb.chordCompletions().map((c) => c.shortcut)).toEqual(["g i"]);
  });

  it("chordCompletions builds the ctx once; a suspended stack reaches nothing and says so", () => {
    let builds = 0;
    const { kb } = rig();
    kb.bindScopes({
      nodes: [cmd("a", "g a", { scope: "s" }), cmd("b", "g b", { scope: "s" })],
      scopes: ["s"],
      ctx: () => {
        builds++;
        return testCtx;
      },
      activeScopes: () => ["s"],
      onActivate: () => {},
    });
    builds = 0;
    expect(kb.chordCompletions("g")).toHaveLength(2);
    expect(builds).toBe(1);
    let told = 0;
    kb.subscribeStack(() => {
      told++;
    });
    kb.setSuspended(true);
    expect(told).toBe(1);
    expect(kb.describeStack().reachable).toEqual([]);
  });

  it("a description made inside a handler reads the facts as they are now", () => {
    const { kb } = rig();
    let facts: Record<string, string> = { scopes: "list" };
    let seen: string[] = [];
    kb.bindScopes({
      nodes: [cmd("open", "Enter", { scope: "list" }), cmd("reply", "r", { scope: "thread" })],
      scopes: ["list", "thread"],
      ctx: () => ({ ...testCtx, facts }),
      activeScopes: (c) => String(c.facts?.scopes).split(" "),
      onActivate: () => {
        facts = { scopes: "thread" };
        seen = kb.describeStack().reachable.map((r) => r.binding);
      },
    });
    kb.handleKeydown(key("Enter"));
    expect(seen).toEqual(["r"]);
  });
});

describe("L16 subscribeStack hears every push, pop and update, each in its final state", () => {
  it("once per change until unsubscribed, and stackVersion counts every change", () => {
    const { kb } = rig();
    let heard = 0;
    const off = kb.subscribeStack(() => {
      heard++;
    });
    const before = kb.stackVersion;
    const layer = kb.pushLayer({});
    kb.updateLayer(layer, { bindings: { j: () => {} } });
    kb.popLayer(layer);
    off();
    kb.pushLayer({});
    expect(heard).toBe(3);
    expect(kb.stackVersion).toBe(before + 4);
  });

  it("a subscriber reading the stack during registerShortcuts sees it finished", () => {
    const { kb, run } = scoped([cmd("back", "Escape", { scope: "thread" })]);
    const seen: string[][] = [];
    kb.subscribeStack(() => {
      seen.push(kb.describeStack().layers.map((l) => l.id.replace(/\d+$/, "")));
    });
    kb.registerShortcuts(new Map([["j", cmd("next", "j")]]), { onActivate: run });
    expect(seen).toEqual([["scope:thread:", "kernel-shortcuts:"]]);
    expect(kb.describeStack().reachable.find((r) => r.binding === "j")?.node?.id).toBe("next");
  });
});
