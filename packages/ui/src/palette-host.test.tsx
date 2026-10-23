// happy-dom must be installed BEFORE @testing-library/react evaluates (see dom-setup.ts)
import "../../../test/dom-setup.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { CommandNode, CommandResult, Ctx } from "@command-kernel/core";
import { createKernel } from "@command-kernel/core";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { registerDom, unregisterDom } from "../../../test/dom-setup.js";
import { type FrecencyStorage, useFrecency } from "./useFrecency.js";
import { usePalette } from "./usePalette.js";
import type { PaletteSource } from "./usePaletteSources.js";

/** What a host app plugs into the palette: its own search, row notes, disabled rows, frecency. */

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

const ctx = (facts: Ctx["facts"] = {}): Ctx => ({
  location: { module: "inbox" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
  facts,
});

const ran: string[] = [];
const reply: CommandNode = {
  id: "reply",
  title: "Reply",
  category: "Messages",
  args: [{ id: "body", label: "body", kind: "text", required: true }],
  run: async () => ({ kind: "toast", message: "replied" }),
};
const label: CommandNode = {
  id: "thread.label",
  title: "Label thread",
  category: "Thread",
  disabled: (c) => (c.facts?.threadOpen ? undefined : "Open a thread first"),
  args: [{ id: "tag", label: "tag", kind: "string", required: true }],
  run: async () => ({ kind: "toast", message: "labelled" }),
};
const roots: CommandNode[] = [
  reply,
  label,
  {
    id: "thread.archive",
    title: "Archive thread",
    category: "Thread",
    disabled: (c) => (c.facts?.threadOpen ? undefined : "Open a thread first"),
    run: async () => {
      ran.push("archive");
      return { kind: "toast", message: "archived" };
    },
  },
  {
    id: "compose",
    title: "New message",
    category: "Messages",
    run: async () => {
      ran.push("compose");
      return { kind: "toast", message: "composed" };
    },
  },
];

const tick = (ms = 0) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

function mount(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const results: CommandResult[] = [];
  const view = render(
    <CommandPalette
      open
      kernel={createKernel({ roots })}
      ctx={ctx()}
      roots={roots}
      onClose={() => {}}
      onResult={(r) => results.push(r)}
      onExecuted={() => {}}
      {...props}
    />,
  );
  return { view, results };
}

/**
 * The palette's own state, driven through its hook: happy-dom does not deliver a typed value
 * to a controlled input, so typing is `setQuery` (as in palette.test.tsx).
 */
function palette(sources: readonly PaletteSource[]) {
  const results: CommandResult[] = [];
  const kernel = createKernel({ roots });
  const c = ctx();
  const view = renderHook(() =>
    usePalette({
      kernel,
      ctx: c,
      roots,
      open: true,
      sources,
      onResult: (r) => results.push(r),
      onExecuted: () => {},
      onClose: () => {},
    }),
  );
  const type = async (q: string) => {
    act(() => view.result.current.setQuery(q));
    await tick(20);
  };
  const titles = () => view.result.current.ranked.map((r) => r.node.title);
  return { view, results, type, titles };
}

const text = () => document.body.textContent ?? "";
const options = () => [...document.body.querySelectorAll('[role="option"]')];

describe("sources: the host's own search at the root", () => {
  const threads: PaletteSource = {
    id: "threads",
    group: "Threads",
    search: async (q) =>
      q.includes("invoice")
        ? [
            {
              id: "thread:42",
              title: "Invoice 42 is overdue",
              run: async () => ({ kind: "toast", message: "opened thread 42" }),
            },
          ]
        : [],
  };

  const both = [threads];

  it("lists its hits after the commands, under its heading", async () => {
    const { type, titles, view } = palette(both);
    await type("invoice");
    expect(titles().at(-1)).toBe("Invoice 42 is overdue");
    expect(view.result.current.ranked.at(-1)?.node.category).toBe("Threads");
    await type("archive");
    expect(titles()).toEqual(["Archive thread"]); // the old query's hits are gone
  });

  it("a hit runs through the kernel like any row", async () => {
    const { type, view, results } = palette(both);
    await type("invoice");
    const hit = view.result.current.ranked.find((r) => r.node.id === "thread:42");
    await act(async () => {
      view.result.current.activate(hit?.node as CommandNode, false);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(results.map((r) => r.message)).toEqual(["opened thread 42"]);
  });

  it("does not search below its minimum query, and a throw is no rows", async () => {
    const seen: string[] = [];
    const broken: PaletteSource = {
      id: "broken",
      minQuery: 3,
      search: (q) => {
        seen.push(q);
        throw new Error("down");
      },
    };
    const { type, titles } = palette([broken]);
    await type("ne");
    expect(seen).toEqual([]);
    await type("new");
    expect(seen).toEqual(["new"]);
    expect(titles()).toEqual(["New message"]); // the commands are still there
  });

  it("aborts the search an older query started", async () => {
    const signals: AbortSignal[] = [];
    const slow: PaletteSource = {
      id: "slow",
      search: (_q, _c, signal) => {
        signals.push(signal);
        return new Promise(() => {});
      },
    };
    const { type } = palette([slow]);
    await type("inv");
    await type("invo");
    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
  });

  it("is not run once you drill or start an arg", async () => {
    const seen: string[] = [];
    const spy: PaletteSource = { id: "spy", search: (q) => (seen.push(q), []) };
    const { type, view } = palette([spy]);
    await act(async () => {
      view.result.current.activate(reply, false);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(view.result.current.mode).toBe("args");
    await type("anything");
    expect(seen).toEqual([]);
  });
});

describe("rows say why they cannot run", () => {
  it("a disabled node is listed, greyed, with the kernel's reason", () => {
    mount();
    const row = options().find((o) => o.textContent?.includes("Archive thread"));
    expect(row?.getAttribute("aria-disabled")).toBe("true");
    expect(row?.textContent).toContain("Open a thread first");
  });

  it("picking it says the reason at once and runs nothing", async () => {
    ran.length = 0;
    mount();
    const row = options().find((o) => o.textContent?.includes("Archive thread"));
    await act(async () => {
      fireEvent.click(row as Element);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(ran).toEqual([]);
    expect(text()).toContain("You can't run this here");
  });

  it("one that takes args says the reason before asking for any", async () => {
    mount();
    const row = options().find((o) => o.textContent?.includes("Label thread"));
    await act(async () => {
      fireEvent.click(row as Element);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(text()).toContain("You can't run this here");
    expect(text()).toContain("Open a thread first");
    expect(document.body.querySelector('input[aria-label="tag"]')).toBeNull();
  });

  it("the same node runs once the host's facts allow it", async () => {
    ran.length = 0;
    mount({ ctx: ctx({ threadOpen: true }) });
    const row = options().find((o) => o.textContent?.includes("Archive thread"));
    expect(row?.getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(row as Element);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(ran).toEqual(["archive"]);
  });
});

describe("rowAdornment and grouping", () => {
  it("draws the host's adornment on each row, knowing which one is active", () => {
    mount({
      rowAdornment: (node, { active }) => (
        <span data-note={node.id}>{active ? "active" : "idle"}</span>
      ),
    });
    const rows = options();
    expect(rows).toHaveLength(4);
    // one per row, and the active one is the selected option
    rows.forEach((row) => {
      const note = row.querySelector("[data-note]")?.textContent;
      expect(note).toBe(row.getAttribute("aria-selected") === "true" ? "active" : "idle");
    });
  });

  it("puts rows under their category headings, each category once", () => {
    mount();
    const groups = [...document.body.querySelectorAll('[role="group"]')].map((g) => ({
      label: g.getAttribute("aria-label"),
      rows: g.querySelectorAll('[role="option"]').length,
    }));
    expect(groups.map((g) => g.label).sort()).toEqual(["Messages", "Thread"]);
    expect(groups.find((g) => g.label === "Messages")?.rows).toBe(2);
  });
});

describe("useFrecency", () => {
  const memory = (): FrecencyStorage & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return {
      data,
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => {
        data[k] = v;
      },
    };
  };

  it("counts what runs, and keeps it under its key", () => {
    const storage = memory();
    const { result } = renderHook(() => useFrecency({ storageKey: "p", storage }));
    act(() => result.current.bump("compose"));
    act(() => result.current.bump("compose"));
    expect(result.current.frecency).toEqual({ compose: 2 });
    expect(JSON.parse(storage.data.p ?? "{}")).toEqual({ compose: 2 });
  });

  it("starts from what was kept, dropping anything that is not a number", () => {
    const storage = memory();
    storage.setItem("p", JSON.stringify({ compose: 3, junk: "x" }));
    const { result } = renderHook(() => useFrecency({ storageKey: "p", storage }));
    expect(result.current.frecency).toEqual({ compose: 3 });
  });

  it("without a key it keeps nothing", () => {
    const storage = memory();
    const { result } = renderHook(() => useFrecency({ storage }));
    act(() => result.current.bump("x"));
    expect(result.current.frecency).toEqual({ x: 1 });
    expect(storage.data).toEqual({});
  });
});
