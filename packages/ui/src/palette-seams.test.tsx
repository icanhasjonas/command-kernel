// happy-dom must be installed BEFORE @testing-library/react evaluates (see dom-setup.ts)
import "../../../test/dom-setup.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { CommandNode, Ctx, Ranked } from "@command-kernel/core";
import { createKernel } from "@command-kernel/core";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { registerDom, unregisterDom } from "../../../test/dom-setup.js";
import { useFrecency } from "./useFrecency.js";
import { type PaletteArrange, usePalette } from "./usePalette.js";
import type { PaletteAnswer, PaletteSource } from "./usePaletteSources.js";

/**
 * The seams a host with its own layout and its own search needs (gate-mail): the root laid out
 * by the host, a search that keeps answering, rows that keep the palette open, the close as a
 * command starts, the host's keys, footer, words and first query.
 */

let CommandPalette: typeof import("./CommandPalette.js").CommandPalette;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => {
  registerDom();
  ({ CommandPalette } = await import("./CommandPalette.js"));
});
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 40));
});
afterAll(() => unregisterDom());

const ctx: Ctx = {
  location: { module: "inbox" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
  facts: {},
};

const log: string[] = [];
let release: () => void = () => {};
const node = (id: string, title: string, category: string): CommandNode => ({
  id,
  title,
  category,
  run: async () => {
    log.push(`run ${id}`);
    return { kind: "toast", message: id };
  },
});
const compose = node("compose", "New message", "Messages");
const archive = node("archive", "Archive", "Thread");
// a run that takes its time: the palette must not wait for it
const slow: CommandNode = {
  id: "slow",
  title: "Send later",
  category: "Messages",
  run: async () => {
    log.push("run slow");
    await new Promise<void>((r) => {
      release = r;
    });
    return { kind: "toast", message: "sent" };
  },
};
const broken: CommandNode = {
  id: "broken",
  title: "Broken",
  category: "Messages",
  run: async () => {
    throw new Error("down");
  },
};
const roots = [compose, archive, slow, broken];

const tick = (ms = 20) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

type Hooks = Parameters<typeof usePalette>[0];
function palette(extra: Partial<Hooks> = {}) {
  const kernel = createKernel({ roots });
  const view = renderHook(() =>
    usePalette({
      kernel,
      ctx,
      roots,
      open: true,
      onResult: () => {},
      onExecuted: (id) => log.push(`executed ${id}`),
      onClose: () => log.push("close"),
      ...extra,
    }),
  );
  const type = async (q: string) => {
    act(() => view.result.current.setQuery(q));
    await tick();
  };
  const activate = async (n: CommandNode) => {
    await act(async () => {
      view.result.current.activate(n, false);
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const rows = () => view.result.current.ranked.map((r) => `${r.node.category}:${r.node.title}`);
  return { view, type, activate, rows };
}

const options = () => [...document.body.querySelectorAll('[role="option"]')];

describe("arrange: the host lays out the root", () => {
  // the screen's own group first, what was run lately under Recent too, the hits after
  const arrange: PaletteArrange = ({ commands, found }) => {
    const recent: Ranked[] = commands
      .filter((r) => r.node.id === "archive")
      .map((r) => ({ ...r, node: { ...r.node, category: "Recent" } }));
    const thread = commands.filter((r) => r.node.category === "Thread");
    const rest = commands.filter((r) => r.node.category !== "Thread");
    return [...recent, ...thread, ...rest, ...found];
  };

  it("draws the rows in the host's order, a node under two headings", () => {
    const { rows } = palette({ arrange });
    expect(rows().slice(0, 2)).toEqual(["Recent:Archive", "Thread:Archive"]);
    expect(rows().slice(2).sort()).toEqual([
      "Messages:Broken",
      "Messages:New message",
      "Messages:Send later",
    ]);
  });

  it("gets the sources' rows apart from the commands", async () => {
    const seen: Ranked[][] = [];
    const hits: PaletteSource = {
      id: "hits",
      group: "Threads",
      search: () => [node("thread:1", "Invoice", "Threads")],
    };
    const { type } = palette({
      sources: [hits],
      arrange: (input) => {
        seen.push([...input.found]);
        return [...input.found, ...input.commands];
      },
    });
    await type("invoice");
    expect(seen.at(-1)?.map((r) => r.node.id)).toEqual(["thread:1"]);
  });
});

describe("sources that keep answering", () => {
  it("update() replaces the answer, and a note is kept with it", async () => {
    let later: (a: PaletteAnswer) => void = () => {};
    const threads: PaletteSource = {
      id: "threads",
      group: "Threads",
      search: (_q, _c, _s, update) => {
        later = update;
        return { rows: [], note: "Searching" };
      },
    };
    const { view, type, rows } = palette({ sources: [threads] });
    await type("inv");
    expect(view.result.current.notes.map((n) => n.note)).toEqual(["Searching"]);
    act(() => later({ rows: [node("thread:1", "Invoice", "Threads")], note: "That is all" }));
    expect(rows()).toContain("Threads:Invoice");
    expect(view.result.current.notes.map((n) => n.note)).toEqual(["That is all"]);
  });

  it("a row it marks keepOpen runs without closing the palette", async () => {
    log.length = 0;
    const more = node("more", "Search further back", "Threads");
    const threads: PaletteSource = {
      id: "threads",
      search: () => ({ rows: [more], keepOpen: ["more"] }),
    };
    const { view, type, activate } = palette({ sources: [threads] });
    await type("inv");
    await activate(more);
    expect(log).toEqual(["run more", "executed more"]);
    expect(view.result.current.mode).toBe("browse");
  });

  it("a note stands in for the empty state", async () => {
    const threads: PaletteSource = { id: "t", search: () => ({ rows: [], note: "Searching…" }) };
    render(
      <CommandPalette
        open
        kernel={createKernel({ roots })}
        ctx={ctx}
        roots={roots}
        sources={[threads]}
        initialQuery="zzzz"
        onClose={() => {}}
        onResult={() => {}}
        onExecuted={() => {}}
      />,
    );
    await tick();
    expect(document.body.textContent).toContain("Searching…");
    expect(document.body.textContent).not.toContain("Nothing here matches");
  });
});

describe("the palette gets out of a command's way", () => {
  it("closes as the command starts, before a slow run finishes", async () => {
    log.length = 0;
    const ran: string[] = [];
    const { activate } = palette({ onRun: (n) => ran.push(n.id) });
    await activate(slow);
    expect(ran).toEqual(["slow"]);
    expect(log).toEqual(["close", "run slow"]);
    await act(async () => release());
    await tick();
    expect(log).toEqual(["close", "run slow", "executed slow"]);
  });

  it("a run that throws is the host's to tell, and the palette closes", async () => {
    log.length = 0;
    const errors: string[] = [];
    const { activate } = palette({
      onError: (e, n) => errors.push(`${n.id}: ${(e as Error).message}`),
    });
    await activate(broken);
    expect(errors).toEqual(["broken: down"]);
    expect(log).toEqual(["close"]);
  });
});

describe("the host's keys, footer, words and first query", () => {
  const mount = (props: Partial<Parameters<typeof CommandPalette>[0]> = {}) =>
    render(
      <CommandPalette
        open
        kernel={createKernel({ roots })}
        ctx={ctx}
        roots={roots}
        onClose={() => log.push("close")}
        onResult={() => {}}
        onExecuted={() => {}}
        {...props}
      />,
    );
  const input = () => document.body.querySelector("input") as HTMLInputElement;

  it("a key the host takes never reaches the palette", async () => {
    log.length = 0;
    const heard: string[] = [];
    mount({
      onKeyDown: (e, { query, mode }) => {
        heard.push(`${e.key} ${mode} "${query}"`);
        return e.key === "Enter";
      },
    });
    await tick();
    fireEvent.keyDown(input(), { key: "Enter" });
    await tick();
    expect(heard).toEqual([`Enter browse ""`]);
    expect(log).toEqual([]);
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(log).toEqual(["close"]);
  });

  it("draws the host's footer, its words and its first query", async () => {
    mount({
      footer: <button type="button">Every shortcut</button>,
      labels: { title: "Search and commands", description: "Find a thread or run a command" },
      initialQuery: "arch",
    });
    await tick();
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    const named = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    const said = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
    expect(named?.textContent).toBe("Search and commands");
    expect(said?.textContent).toBe("Find a thread or run a command");
    expect(document.body.textContent).toContain("Every shortcut");
    expect(input().value).toBe("arch");
    expect(options().map((o) => o.textContent)).toEqual(["Archive"]);
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe("1 result");
  });

  it("the header says where and as whom in the host's words, or nothing", async () => {
    mount({ labels: { context: (where) => `On ${where}` } });
    await tick();
    expect(document.body.textContent).toContain("On inbox");
    expect(document.body.textContent).not.toContain("admin");
    cleanup();
    mount({ labels: { context: () => "" } });
    await tick();
    expect(document.body.textContent).not.toContain("inbox");
  });

  it("the search box is a combobox even when nothing matches", async () => {
    mount({ initialQuery: "zzzz" });
    await tick();
    expect(input().getAttribute("role")).toBe("combobox");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("useFrecency counts only what the host counts", () => {
  it("leaves out ids it is told to", () => {
    const { result } = renderHook(() => useFrecency({ counts: (id) => !id.startsWith("thread:") }));
    act(() => result.current.bump("thread:1"));
    act(() => result.current.bump("compose"));
    expect(result.current.frecency).toEqual({ compose: 1 });
  });
});
