import { describe, expect, it } from "bun:test";
import { createKeyboard, type KernelKeyEvent, validateShortcuts } from "./keyboard.js";
import { isMac } from "./shortcut.js";
import type { CommandNode, Ctx, Fact } from "./types.js";

const ctxWith = (facts: Record<string, Fact> = {}): Ctx => ({
  location: { module: "mail" },
  user: { id: "u1", name: "T", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
  facts,
});

const node = (id: string, shortcut: string, extra: Partial<CommandNode> = {}): CommandNode => ({
  id,
  title: id,
  shortcut,
  ...extra,
});

function key(k: string, mods: Partial<KernelKeyEvent> = {}) {
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
const mod = isMac ? { metaKey: true } : { ctrlKey: true };
const field = { tagName: "TEXTAREA" };

/** a keyboard with `nodes` bound over list < thread < composer, live per `facts.scopes` */
function setup(nodes: CommandNode[], facts: Record<string, Fact> = {}) {
  const kb = createKeyboard();
  const hits: string[] = [];
  let built = 0;
  const state = { facts };
  const binding = kb.bindScopes({
    nodes,
    scopes: ["global", "list", "thread", "composer"],
    ctx: () => {
      built++;
      return ctxWith(state.facts);
    },
    activeScopes: (c) => String(c.facts?.scopes ?? "global").split(" "),
    onActivate: (n) => hits.push(n.id),
  });
  return { kb, hits, state, binding, builds: () => built };
}

describe("named keys and shifted symbols reach their nodes (regression)", () => {
  // On main before this change none of these fired: `mod+enter` normalized to `mod+enter` while
  // the press was `mod+Enter`, and `?` arrived as `shift+?`.
  it("registerShortcuts fires mod+Enter, ?, and Escape", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.registerShortcuts(
      new Map([
        ["mod+enter", node("send", "mod+enter")],
        ["?", node("help", "?")],
        ["Escape", node("close", "Escape")],
      ]),
      { onActivate: (n) => hits.push(n.id) },
    );
    kb.handleKeydown(key("Enter", mod));
    kb.handleKeydown(key("?", { shiftKey: true }));
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["send", "help", "close"]);
  });

  it("the plus key binds as `+` and as `shift++`", () => {
    const { kb, hits } = setup([node("zoom", "+")]);
    kb.handleKeydown(key("+", { shiftKey: true }));
    expect(hits).toEqual(["zoom"]);
  });
});

describe("bindScopes - context layers", () => {
  it("one key, the right node per live scope; the top live scope wins", () => {
    const nodes = [
      node("back", "Escape", { scope: "thread" }),
      node("discard", "Escape", { scope: "composer" }),
    ];
    const { kb, hits, state } = setup(nodes, { scopes: "thread" });
    kb.handleKeydown(key("Escape"));
    state.facts = { scopes: "thread composer" };
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["back", "discard"]);
  });

  it("a scope that is not live does not fire, and leaves the key unprevented", () => {
    const { kb, hits } = setup([node("next", "j", { scope: "list" })], { scopes: "global" });
    const e = key("j");
    kb.handleKeydown(e);
    expect(hits).toEqual([]);
    expect(e.prevented).toBe(false);
  });

  it("a disabled node declines: the key falls through to the scope below", () => {
    const nodes = [
      node("back", "Escape", { scope: "thread" }),
      node("discard", "Escape", {
        scope: "composer",
        disabled: (c) => (c.facts?.newMail ? undefined : "Only in New mail"),
      }),
    ];
    const { kb, hits, state } = setup(nodes, { scopes: "thread composer" });
    kb.handleKeydown(key("Escape"));
    state.facts = { scopes: "thread composer", newMail: true };
    kb.handleKeydown(key("Escape"));
    expect(hits).toEqual(["back", "discard"]);
  });

  it("when nothing takes the key, it is left to the browser", () => {
    const disabled = () => "Write something first";
    const { kb, hits } = setup([node("send", "mod+enter", { scope: "composer", disabled })], {
      scopes: "composer",
    });
    const e = key("Enter", mod);
    kb.handleKeydown(e);
    expect(hits).toEqual([]);
    expect(e.prevented).toBe(false);
  });

  it("a node hidden by `when` declines like a disabled one", () => {
    const when = (c: Ctx) => c.facts?.threadOpen === true;
    const { kb, hits, state } = setup([node("reply", "r", { scope: "thread", when })], {
      scopes: "thread",
    });
    kb.handleKeydown(key("r"));
    state.facts = { scopes: "thread", threadOpen: true };
    kb.handleKeydown(key("r"));
    expect(hits).toEqual(["reply"]);
  });

  it("the first runnable node of one key in one scope takes it", () => {
    const nodes = [node("a", "x", { disabled: () => "no" }), node("b", "x"), node("c", "x")];
    const { kb, hits } = setup(nodes);
    kb.handleKeydown(key("x"));
    expect(hits).toEqual(["b"]);
  });

  it("a letter typed in a field never fires; mod+Enter from the field does", () => {
    const nodes = [node("new", "c"), node("send", "mod+enter", { scope: "composer" })];
    const { kb, hits } = setup(nodes, { scopes: "global composer" });
    kb.handleKeydown(key("c", { target: field }));
    kb.handleKeydown(key("?", { shiftKey: true, target: field }));
    kb.handleKeydown(key("Enter", { ...mod, target: field }));
    expect(hits).toEqual(["send"]);
  });

  it("a key a widget already handled is left alone", () => {
    const { kb, hits } = setup([node("next", "ArrowDown")]);
    kb.handleKeydown(key("ArrowDown", { defaultPrevented: true }));
    expect(hits).toEqual([]);
  });

  it("chords work in a scope, and do not arm while it is not live", () => {
    const nodes = [node("inbox", "g i", { scope: "list" })];
    const { kb, hits, state } = setup(nodes, { scopes: "global" });
    const g = key("g");
    kb.handleKeydown(g);
    expect(g.prevented).toBe(false);
    expect(kb.chordPrefix).toBeNull();
    state.facts = { scopes: "list" };
    kb.handleKeydown(key("g"));
    expect(kb.chordCompletions().map((c) => c.node?.id)).toEqual(["inbox"]);
    kb.handleKeydown(key("i"));
    expect(hits).toEqual(["inbox"]);
    expect(kb.chordPrefix).toBeNull();
  });

  it("a node in several scopes is live in each", () => {
    const nodes = [node("palette", "mod+k", { scope: ["global", "composer"] })];
    const { kb, hits } = setup(nodes, { scopes: "composer" });
    kb.handleKeydown(key("k", mod));
    expect(hits).toEqual(["palette"]);
  });

  it("builds the ctx once per press, however many layers ask", () => {
    const nodes = [node("a", "x", { scope: "thread" }), node("b", "y", { scope: "list" })];
    const { kb, builds } = setup(nodes, { scopes: "list thread" });
    kb.handleKeydown(key("x"));
    expect(builds()).toBe(1);
  });

  it("refuses a scope it was not told about", () => {
    const kb = createKeyboard();
    expect(() =>
      kb.bindScopes({
        nodes: [node("a", "x", { scope: "nowhere" })],
        scopes: ["global"],
        ctx: () => ctxWith(),
        activeScopes: () => ["global"],
        onActivate: () => {},
      }),
    ).toThrow("nowhere");
  });

  it("dispose takes every scope layer off the keyboard", () => {
    const { kb, hits, binding } = setup([node("a", "x")]);
    binding.dispose();
    kb.handleKeydown(key("x"));
    expect(hits).toEqual([]);
    expect(kb.isBindingRegistered("x")).toBe(false);
  });
});

describe("validateShortcuts - per scope", () => {
  it("one key in two scopes is the point; twice in one scope is a conflict", () => {
    const conflicts = validateShortcuts([
      node("back", "Escape", { scope: "thread" }),
      node("discard", "Escape", { scope: "composer" }),
      node("next", "j", { scope: "list" }),
      node("junk", "J", { scope: "list" }),
      node("help", "?"),
      node("help2", "shift+?"),
    ]);
    expect(conflicts).toEqual([
      { shortcut: "j", nodeIds: ["next", "junk"], scope: "list" },
      { shortcut: "?", nodeIds: ["help", "help2"] },
    ]);
  });
});
