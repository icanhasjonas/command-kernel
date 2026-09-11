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

// The guard the port dropped. remote-claude's key-layers.ts:368 reads
//   if (inTextInput && !isModified && !isNonPrintable) return
// and without it a bare `n` bound to "New task" fires while somebody types the
// letter n into a title field. Ported here with the same three-part rule: only
// UNMODIFIED PRINTABLE keys are surrendered to the editable surface.
describe("editable-target guard", () => {
  const field = { tagName: "INPUT", isContentEditable: false };

  it("a bare printable key does not fire while typing into a field", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    const e = key("n", { target: field });
    kb.handleKeydown(e);
    expect(hits).toEqual([]);
    expect(e.prevented).toBe(false); // the field must still receive the n
  });

  it("the same key still fires when focus is not in a field", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    kb.handleKeydown(key("n"));
    expect(hits).toEqual(["new"]);
  });

  it("a modified shortcut still fires inside a field — mod+k is never typing", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ "mod+k": () => hits.push("palette") });
    kb.handleKeydown({ ...modKey("k"), target: field } as ReturnType<typeof key>);
    expect(hits).toEqual(["palette"]);
  });

  it("a non-printable key still fires inside a field — Escape is never typing", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ Escape: () => hits.push("close") });
    kb.handleKeydown(key("Escape", { target: field }));
    expect(hits).toEqual(["close"]);
  });

  it("contentEditable counts as a field even though its tagName does not", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    kb.handleKeydown(key("n", { target: { tagName: "DIV", isContentEditable: true } }));
    expect(hits).toEqual([]);
  });

  it("a bare chord prefix does not arm while typing", () => {
    const kb = createKeyboard();
    kb.pushLayer({ "g d": () => {} });
    kb.handleKeydown(key("g", { target: field }));
    expect(kb.chordPrefix).toBeNull();
  });

  // THE TAGNAME CHECK IS NOT ENOUGH, and every headless UI library proves it: Base UI, Radix and
  // Headless UI all render a listbox as a `div` with a role, and focus lands on the OPTION. Measured
  // in Chrome against Base UI's Select on 2026-09-10: with the popup open, `document.activeElement`
  // was a `DIV` with `role="option"` — so a bare `n` bound to "New task" fired instead of doing the
  // listbox's own typeahead, and the dialog opened over the menu the user was reading.
  const OPTION = { tagName: "DIV", role: "option" };

  it("a bare key does not fire on a focused listbox option", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    kb.handleKeydown(key("n", { target: OPTION }));
    expect(hits).toEqual([]);
  });

  it("covers the widget roles that own their own typeahead", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    for (const role of [
      "combobox",
      "listbox",
      "menu",
      "menuitem",
      "textbox",
      "searchbox",
      "tree",
    ]) {
      kb.handleKeydown(key("n", { target: { tagName: "DIV", role } }));
    }
    expect(hits).toEqual([]);
  });

  it("reads the role attribute when the property is not reflected", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    kb.handleKeydown(
      key("n", {
        target: { tagName: "DIV", getAttribute: (a: string) => (a === "role" ? "option" : null) },
      }),
    );
    expect(hits).toEqual([]);
  });

  it("finds the widget when focus is on a child of it", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    // A trigger that keeps focus while its popup is open: the element itself has no role, but it
    // sits inside one.
    kb.handleKeydown(
      key("n", {
        target: { tagName: "SPAN", closest: (sel: string) => (sel.includes("role") ? {} : null) },
      }),
    );
    expect(hits).toEqual([]);
  });

  it("an ordinary div is still fair game — a role is required, not a tag", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    kb.handleKeydown(key("n", { target: { tagName: "DIV" } }));
    expect(hits).toEqual(["new"]);
  });

  it("a modified shortcut still reaches the kernel from inside a listbox", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ "mod+k": () => hits.push("palette") });
    kb.handleKeydown({ ...modKey("k"), target: OPTION } as ReturnType<typeof key>);
    expect(hits).toEqual(["palette"]);
  });

  it("the host can replace the guard entirely", () => {
    const kb = createKeyboard({ isEditableTarget: () => true });
    const hits: string[] = [];
    kb.pushLayer({ n: () => hits.push("new") });
    kb.handleKeydown(key("n"));
    expect(hits).toEqual([]);
  });
});

// key-layers.ts:257-264. A key RECORDER cannot know which layer owns the key the
// user is about to press, so the mute is global rather than per-layer.
describe("suspend", () => {
  it("suspended mutes every layer, and resuming restores them", () => {
    const kb = createKeyboard();
    const hits: string[] = [];
    kb.pushLayer({ g: () => hits.push("g") });
    kb.setSuspended(true);
    kb.handleKeydown(key("g"));
    expect(hits).toEqual([]);
    expect(kb.suspended).toBe(true);
    kb.setSuspended(false);
    kb.handleKeydown(key("g"));
    expect(hits).toEqual(["g"]);
  });

  it("a suspended keyboard does not cancel the event either", () => {
    const kb = createKeyboard();
    kb.pushLayer({ g: () => {} });
    kb.setSuspended(true);
    const e = key("g");
    kb.handleKeydown(e);
    expect(e.prevented).toBe(false);
  });

  it("suspending mid-chord clears the armed prefix", () => {
    const kb = createKeyboard();
    kb.pushLayer({ "g d": () => {} });
    kb.handleKeydown(key("g"));
    expect(kb.chordPrefix).toBe("g");
    kb.setSuspended(true);
    expect(kb.chordPrefix).toBeNull();
  });
});

// validateShortcuts only ever sees a STATIC node list, so it is blind to anything
// a driver registered ad hoc through pushLayer. This asks the live stack.
describe("isBindingRegistered", () => {
  it("sees a binding on a live layer, normalized across spellings", () => {
    const kb = createKeyboard();
    kb.pushLayer({ [normalizeShortcut(parseShortcut("mod+k"))]: () => {} });
    expect(kb.isBindingRegistered("cmd+k")).toBe(true);
    expect(kb.isBindingRegistered("mod+j")).toBe(false);
  });

  it("can exclude the layer doing the asking, so a rebind is not its own conflict", () => {
    const kb = createKeyboard();
    const mine = kb.pushLayer({ g: () => {} }, { id: "editor" });
    expect(kb.isBindingRegistered("g")).toBe(true);
    expect(kb.isBindingRegistered("g", mine.id)).toBe(false);
  });

  it("ignores a disabled layer", () => {
    const kb = createKeyboard();
    kb.pushLayer({ g: () => {} }, { enabled: false });
    expect(kb.isBindingRegistered("g")).toBe(false);
  });

  it("finds a chord binding by its full pattern", () => {
    const kb = createKeyboard();
    kb.pushLayer({ "g d": () => {} });
    expect(kb.isBindingRegistered("g d")).toBe(true);
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

describe("chordCompletions", () => {
  /**
   * A CHORD THE USER CANNOT SEE IS A CHORD THE USER HAS TO MEMORISE.
   *
   * `subscribeChordMode` could say a prefix went live and nothing more, so a host that wanted to
   * draw "you pressed g, here is what follows" had to filter its own copy of the bindings. That
   * copy is a second source of truth, and it goes stale the moment anything is bound at runtime
   * through `pushLayer` -- which is exactly when a hint matters most.
   */
  const node = (id: string): CommandNode => ({ id, title: id, run: async () => ({ kind: "noop" }) });

  it("lists every key that completes the prefix, with the node each runs", () => {
    const kb = createKeyboard();
    kb.registerShortcuts(
      new Map([
        ["g p", node("people")],
        ["g t", node("teams")],
        ["c t", node("task.new")],
      ]),
      { onActivate: () => {} },
    );

    const out = kb.chordCompletions("g");
    expect(out.map((c) => c.key).sort()).toEqual(["p", "t"]);
    expect(out.find((c) => c.key === "p")?.node?.id).toBe("people");
    expect(out.find((c) => c.key === "t")?.shortcut).toBe("g t");
  });

  it("defaults to the armed prefix, which is the common call", () => {
    const kb = createKeyboard();
    kb.registerShortcuts(new Map([["g p", node("people")]]), { onActivate: () => {} });
    expect(kb.chordCompletions()).toEqual([]);

    kb.handleKeydown(key("g"));
    expect(kb.chordPrefix).toBe("g");
    expect(kb.chordCompletions().map((c) => c.key)).toEqual(["p"]);
  });

  it("offers nothing for a prefix nothing is bound under", () => {
    const kb = createKeyboard();
    kb.registerShortcuts(new Map([["g p", node("people")]]), { onActivate: () => {} });
    expect(kb.chordCompletions("z")).toEqual([]);
  });

  it("agrees with the decision to arm -- isChordPrefix reads the same walk", () => {
    // The two were one loop with the result discarded. If they ever disagree, the app arms a chord
    // it cannot draw, or draws one it will not fire.
    const kb = createKeyboard();
    kb.registerShortcuts(new Map([["g p", node("people")]]), { onActivate: () => {} });
    kb.handleKeydown(key("z"));
    expect(kb.chordPrefix).toBeNull();
    kb.handleKeydown(key("g"));
    expect(kb.chordPrefix).toBe("g");
  });

  it("lets a later layer win the same second key, as a real press would", () => {
    const kb = createKeyboard();
    kb.registerShortcuts(new Map([["g p", node("people")]]), { onActivate: () => {} });
    kb.pushLayer({ "g p": () => {} }, { id: "modal" });

    const out = kb.chordCompletions("g");
    expect(out).toHaveLength(1);
    // The modal layer bound it without a node, and it is the one that would fire.
    expect(out[0]?.node).toBeUndefined();
  });

  it("skips a disabled layer, because a disabled layer fires nothing", () => {
    const kb = createKeyboard();
    kb.registerShortcuts(new Map([["g p", node("people")]]), { onActivate: () => {} });
    const layer = kb.pushLayer({ "g t": () => {} }, { id: "modal" });
    expect(kb.chordCompletions("g").map((c) => c.key).sort()).toEqual(["p", "t"]);

    layer.options.enabled = false;
    expect(kb.chordCompletions("g").map((c) => c.key)).toEqual(["p"]);
  });

  it("offers nothing while the stack is suspended", () => {
    const kb = createKeyboard();
    kb.registerShortcuts(new Map([["g p", node("people")]]), { onActivate: () => {} });
    kb.setSuspended(true);
    expect(kb.chordCompletions("g")).toEqual([]);
  });

  it("does not report a deeper sequence as a completion of this prefix", () => {
    const kb = createKeyboard();
    kb.registerShortcuts(
      new Map([
        ["g p", node("people")],
        ["g p x", node("deeper")],
      ]),
      { onActivate: () => {} },
    );
    expect(kb.chordCompletions("g").map((c) => c.key)).toEqual(["p"]);
  });
});
