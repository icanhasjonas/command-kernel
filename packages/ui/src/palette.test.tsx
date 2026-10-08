// happy-dom must be installed BEFORE @testing-library/react evaluates - this
// side-effecting import (first, before RTL) guarantees it. See dom-setup.ts.
import "../../../test/dom-setup.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { CommandNode, CommandResult, Ctx } from "@command-kernel/core";
import { createKernel, missingArgs } from "@command-kernel/core";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { registerDom, unregisterDom } from "../../../test/dom-setup.js";
import { usePalette } from "./usePalette.js";

// Loaded AFTER the DOM is registered, never as a static import: Radix decides at
// module load whether a document exists (its layout-effect shim), and when another
// DOM test file ran first, the cached dom-setup import registers nothing, so a
// static import would load Radix DOM-less and its portals would never mount.
let CommandPalette: typeof import("./CommandPalette.js").CommandPalette;

// React 19 wants this flag set before act() is used.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tick = () => new Promise((r) => setTimeout(r, 0));

// the setup module is shared and cached: a DOM test file that ran earlier in this
// process has already unregistered it, so the import above is not enough
beforeAll(async () => {
  registerDom();
  ({ CommandPalette } = await import("./CommandPalette.js"));
});

// Unmount portals AND drain the async focus-restoration Radix schedules on
// unmount: those deferred timers would otherwise fire in a later (core) test
// file - after unregisterDom() nulled the happy-dom window - and crash. Draining
// here, while the DOM is still live, keeps every side effect inside this file.
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 40));
});
afterAll(() => unregisterDom()); // restore native globals - never leak DOM into core tests

const ctx = (role: Ctx["user"]["role"] = "admin"): Ctx => ({
  location: { module: "home" },
  user: { id: "u1", name: "T", role, brand: "circle" },
  now: 0,
  frecency: {},
});

// A real command tree: a navigable node, a plain runner, a two-required-arg
// runner, a confirm-gated runner, and a role-gated runner. No mocks - every
// test drives this through a real createKernel instance.
const buildRoots = (): CommandNode[] => [
  {
    id: "go.users",
    title: "Users",
    resolve: async () => [
      { id: "user.alice", title: "Alice" },
      { id: "user.bob", title: "Bob" },
    ],
  },
  {
    id: "open.settings",
    title: "Settings",
    run: async () => ({ kind: "toast", message: "opened" }),
  },
  {
    id: "create.note",
    title: "New note",
    args: [
      { id: "title", label: "Title", kind: "string", required: true },
      { id: "body", label: "Body", kind: "text", required: true },
    ],
    run: async (a) => ({ kind: "toast", message: `noted ${a.title}/${a.body}` }),
  },
  {
    id: "delete.account",
    title: "Delete account",
    gate: { confirm: true, reason: "irreversible" },
    run: async () => ({ kind: "toast", message: "deleted" }),
  },
  {
    id: "admin.purge",
    title: "Purge logs",
    gate: { roles: ["admin"] },
    run: async () => ({ kind: "toast", message: "purged" }),
  },
];

function mountHook(role: Ctx["user"]["role"] = "admin", rootsOverride?: CommandNode[]) {
  const results: CommandResult[] = [];
  const executed: string[] = [];
  const roots = rootsOverride ?? buildRoots();
  const kernel = createKernel({ roots });
  // STABLE identities across renders - a fresh ctx object each render would
  // retrigger usePalette's ctx-dependent effects and loop forever.
  const ctxObj = ctx(role);
  const hooks = {
    kernel,
    ctx: ctxObj,
    roots,
    open: true,
    onResult: (r: CommandResult) => results.push(r),
    onExecuted: (id: string) => executed.push(id),
    onClose: () => {},
  };
  const view = renderHook(() => usePalette(hooks));
  const nodeById = (id: string) =>
    view.result.current.ranked.find((r) => r.node.id === id)?.node as CommandNode;
  return { view, results, executed, nodeById };
}

describe("usePalette - browse + drill", () => {
  it("lists every root as a completion on open", () => {
    const { view } = mountHook();
    expect(view.result.current.mode).toBe("browse");
    expect(view.result.current.ranked.map((r) => r.node.id).sort()).toEqual([
      "admin.purge",
      "create.note",
      "delete.account",
      "go.users",
      "open.settings",
    ]);
  });

  it("filtering the query narrows the completions to the match", () => {
    const { view } = mountHook();
    act(() => view.result.current.setQuery("sett"));
    expect(view.result.current.ranked.map((r) => r.node.id)).toEqual(["open.settings"]);
  });

  it("drilling a navigable node pushes a frame with its children", async () => {
    const { view, nodeById } = mountHook();
    await act(async () => {
      await view.result.current.drill(nodeById("go.users"));
    });
    expect(view.result.current.frames).toHaveLength(2);
    expect(view.result.current.frame.node?.id).toBe("go.users");
    expect(view.result.current.ranked.map((r) => r.node.id).sort()).toEqual([
      "user.alice",
      "user.bob",
    ]);
  });

  it("back pops the drilled frame off the stack", async () => {
    const { view, nodeById } = mountHook();
    const users = nodeById("go.users");
    await act(async () => {
      await view.result.current.drill(users);
    });
    expect(view.result.current.frames).toHaveLength(2);
    act(() => view.result.current.back());
    expect(view.result.current.frames).toHaveLength(1);
    expect(view.result.current.frame.node).toBeNull();
  });
});

describe("usePalette - the arg collection flow", () => {
  it("a missing required arg surfaces the args state instead of running", () => {
    const { view, nodeById, results } = mountHook();
    const note = nodeById("create.note");
    act(() => view.result.current.activate(note, false));
    expect(view.result.current.mode).toBe("args");
    expect(view.result.current.arg?.node.id).toBe("create.note");
    expect(view.result.current.arg?.activeArg).toBe("title");
    // 0 of 2 collected - both required args still missing, nothing has run
    expect(missingArgs(note, view.result.current.arg?.values ?? {})).toEqual(["title", "body"]);
    expect(results).toHaveLength(0);
  });

  it("committing each arg advances the collection, then runs the command", async () => {
    const { view, nodeById, results, executed } = mountHook();
    act(() => view.result.current.activate(nodeById("create.note"), false));

    act(() => view.result.current.commitArg("Hello")); // fills `title`, advances to `body`
    expect(view.result.current.arg?.activeArg).toBe("body");
    expect(view.result.current.arg?.values.title).toBe("Hello");

    await act(async () => {
      view.result.current.commitArg("World"); // fills `body` -> nothing missing -> runs
      await tick();
    });
    expect(view.result.current.mode).toBe("browse");
    expect(results.map((r) => r.message)).toEqual(["noted Hello/World"]);
    expect(executed).toEqual(["create.note"]);
  });
});

describe("usePalette - the gate + evidence flow", () => {
  it("a confirm-gated command does NOT run - it surfaces the confirm state", async () => {
    const { view, nodeById, results, executed } = mountHook();
    await act(async () => {
      view.result.current.activate(nodeById("delete.account"), false);
      await tick();
    });
    expect(view.result.current.mode).toBe("confirm");
    expect(view.result.current.confirm?.node.id).toBe("delete.account");
    expect(view.result.current.confirm?.blocked).toBe(false);
    expect(results).toHaveLength(0);
    expect(executed).toHaveLength(0);
  });

  it("confirmProceed mints a grant and runs the gated command", async () => {
    const { view, nodeById, results, executed } = mountHook();
    await act(async () => {
      view.result.current.activate(nodeById("delete.account"), false);
      await tick();
    });
    await act(async () => {
      view.result.current.confirmProceed();
      await tick();
    });
    expect(results.map((r) => r.message)).toEqual(["deleted"]);
    expect(executed).toEqual(["delete.account"]);
  });

  it("a role the gate denies gets a BLOCKED confirm, never a run", async () => {
    const { view, nodeById, results } = mountHook("viewer");
    await act(async () => {
      view.result.current.activate(nodeById("admin.purge"), false);
      await tick();
    });
    expect(view.result.current.mode).toBe("confirm");
    expect(view.result.current.confirm?.blocked).toBe(true);
    expect(results).toHaveLength(0);
  });
});

// regression coverage ahead of the usePalette split into usePaletteFrames /
// usePaletteArgs / usePaletteGate: these paths had no test at all before -
// each is proven green here BEFORE the move, and re-checked green after.
describe("usePalette - selection movement", () => {
  it("move() wraps forward and backward across the ranked list, and no-ops at zero length", () => {
    const { view } = mountHook();
    expect(view.result.current.selected).toBe(0);
    act(() => view.result.current.move(-1, 5));
    expect(view.result.current.selected).toBe(4); // wraps to the last item
    act(() => view.result.current.move(1, 5));
    expect(view.result.current.selected).toBe(0); // wraps back to the first
    act(() => view.result.current.move(1, 0));
    expect(view.result.current.selected).toBe(0); // empty list never moves
  });
});

describe("usePalette - a `multiple` arg accumulates until finishArg", () => {
  const tagRoots: CommandNode[] = [
    {
      id: "tag.item",
      title: "Tag item",
      args: [{ id: "tags", label: "Tags", kind: "string", required: true, multiple: true }],
      run: async (a) => ({
        kind: "toast",
        message: `tagged ${Array.isArray(a.tags) ? a.tags.join(",") : ""}`,
      }),
    },
  ];

  it("commitArg accumulates values and stays put; finishArg advances and runs", async () => {
    const { view, nodeById, results, executed } = mountHook("admin", tagRoots);
    act(() => view.result.current.activate(nodeById("tag.item"), false));
    expect(view.result.current.arg?.activeArg).toBe("tags");

    act(() => view.result.current.commitArg("red"));
    expect(view.result.current.mode).toBe("args"); // stayed put - multiple accumulates
    expect(view.result.current.arg?.activeArg).toBe("tags");
    expect(view.result.current.arg?.values.tags).toEqual(["red"]);

    act(() => view.result.current.commitArg("blue"));
    expect(view.result.current.arg?.values.tags).toEqual(["red", "blue"]);

    await act(async () => {
      view.result.current.finishArg();
      await tick();
    });
    expect(view.result.current.mode).toBe("browse");
    expect(results.map((r) => r.message)).toEqual(["tagged red,blue"]);
    expect(executed).toEqual(["tag.item"]);
  });
});

describe("usePalette - confirmAlways records a standing rule", () => {
  it("runs once, then auto-satisfies the same gate next time without asking again", async () => {
    const { view, nodeById, results, executed } = mountHook();
    await act(async () => {
      view.result.current.activate(nodeById("delete.account"), false);
      await tick();
    });
    expect(view.result.current.mode).toBe("confirm");

    await act(async () => {
      view.result.current.confirmAlways();
      await tick();
    });
    expect(results.map((r) => r.message)).toEqual(["deleted"]);
    expect(executed).toEqual(["delete.account"]);

    // second attempt: activate() alone runs it - the standing rule auto-satisfies
    // the gate, so it completes without a second confirmProceed/confirmAlways call
    await act(async () => {
      view.result.current.activate(nodeById("delete.account"), false);
      await tick();
    });
    expect(results.map((r) => r.message)).toEqual(["deleted", "deleted"]);
    expect(executed).toEqual(["delete.account", "delete.account"]);
  });
});

describe("usePalette - arg value completion from enumValues", () => {
  const colorRoots: CommandNode[] = [
    {
      id: "paint.wall",
      title: "Paint wall",
      args: [
        {
          id: "color",
          label: "Color",
          kind: "enum",
          required: true,
          enumValues: [
            { value: "red", label: "Red" },
            { value: "blue", label: "Blue" },
            { value: "green", label: "Green" },
          ],
        },
      ],
      run: async (a) => ({ kind: "toast", message: `painted ${String(a.color)}` }),
    },
  ];

  it("argOptions lists the matching enum values as the query narrows", async () => {
    const { view, nodeById } = mountHook("admin", colorRoots);
    act(() => view.result.current.activate(nodeById("paint.wall"), false));
    expect(view.result.current.mode).toBe("args");
    await act(async () => {
      await tick();
    });
    expect(view.result.current.argOptions.map((o) => o.value).sort()).toEqual([
      "blue",
      "green",
      "red",
    ]);

    act(() => view.result.current.setArgQuery("bl"));
    await act(async () => {
      await tick();
    });
    expect(view.result.current.argOptions.map((o) => o.value)).toEqual(["blue"]);
  });
});

describe("CommandPalette - mounted smoke", () => {
  it("renders open with the kernel's completions and a search input", () => {
    const roots = buildRoots();
    const kernel = createKernel({ roots });
    render(
      <CommandPalette
        open
        kernel={kernel}
        ctx={ctx()}
        roots={roots}
        onClose={() => {}}
        onResult={() => {}}
        onExecuted={() => {}}
      />,
    );
    // Radix portals into document.body - assert against the whole document
    const body = document.body.textContent ?? "";
    expect(body).toContain("Users");
    expect(body).toContain("Settings");
    expect(document.body.querySelector("input")).toBeTruthy();
  });

  it("clicking a result row runs that command through the real kernel", async () => {
    const roots = buildRoots();
    const kernel = createKernel({ roots });
    const results: CommandResult[] = [];
    render(
      <CommandPalette
        open
        kernel={kernel}
        ctx={ctx()}
        roots={roots}
        onClose={() => {}}
        onResult={(r) => results.push(r)}
        onExecuted={() => {}}
      />,
    );
    const row = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Settings"),
    );
    expect(row).toBeTruthy();
    await act(async () => {
      fireEvent.click(row as HTMLButtonElement);
      await tick();
    });
    expect(results.map((r) => r.message)).toEqual(["opened"]);
  });
});

describe("CommandPalette - labels are the consumer's, not the package's", () => {
  const mount = (labels?: Parameters<typeof CommandPalette>[0]["labels"]) => {
    const roots = buildRoots();
    const kernel = createKernel({ roots });
    render(
      <CommandPalette
        open
        kernel={kernel}
        ctx={ctx()}
        roots={roots}
        {...(labels !== undefined && { labels })}
        onClose={() => {}}
        onResult={() => {}}
        onExecuted={() => {}}
      />,
    );
    return document.body;
  };

  // regression: the published palette used to hardcode the playground's app name
  // and its entity nouns. A consumer's users must never see them.
  it("ships neutral defaults - no demo copy anywhere in the rendered palette", () => {
    const body = mount();
    for (const leak of ["Backoffice", "users, forms, submissions", "Everything lives here now"]) {
      expect(body.textContent ?? "").not.toContain(leak);
    }
    expect(body.textContent ?? "").toContain("Commands"); // the neutral root label
    expect(body.querySelector("input")?.getAttribute("placeholder")).toBe("Search commands…");
  });

  it("a partial override replaces only the keys it sets", () => {
    const body = mount({ root: "Acme", placeholder: "Search Acme…" });
    expect(body.textContent ?? "").toContain("Acme");
    expect(body.textContent ?? "").not.toContain("Commands");
    expect(body.querySelector("input")?.getAttribute("placeholder")).toBe("Search Acme…");
    // untouched key keeps its default
    expect(body.textContent ?? "").toContain("drill in");
  });

  it("the search input carries an accessible name", () => {
    const body = mount({ searchLabel: "Search Acme" });
    expect(body.querySelector("input")?.getAttribute("aria-label")).toBe("Search Acme");
  });

  it("the weight diagnostic is off unless asked for", () => {
    const weighted: CommandNode[] = [
      {
        id: "w",
        title: "Weighted",
        weight: 73,
        run: async () => ({ kind: "toast", message: "w" }),
      },
    ];
    const render1 = (showWeight: boolean) =>
      render(
        <CommandPalette
          open
          kernel={createKernel({ roots: weighted })}
          ctx={ctx()}
          roots={weighted}
          showWeight={showWeight}
          onClose={() => {}}
          onResult={() => {}}
          onExecuted={() => {}}
        />,
      );

    render1(false);
    expect(document.body.textContent ?? "").toContain("Weighted");
    expect(document.body.textContent ?? "").not.toContain("73");

    cleanup();
    render1(true);
    expect(document.body.textContent ?? "").toContain("73");
  });
});
