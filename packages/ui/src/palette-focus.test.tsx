// happy-dom must be installed BEFORE @testing-library/react evaluates (see dom-setup.ts)
import "../../../test/dom-setup.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { CommandNode, Ctx } from "@command-kernel/core";
import { createKernel } from "@command-kernel/core";
import { act, cleanup, render } from "@testing-library/react";
import { registerDom, unregisterDom } from "../../../test/dom-setup.js";

// loaded after the DOM is registered (see palette.test.tsx for why)
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
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};
const roots: CommandNode[] = [
  { id: "open.settings", title: "Settings", run: async () => ({ kind: "toast", message: "ok" }) },
];
const kernel = createKernel({ roots });

/** A page with a button that had focus, and the palette over it. */
function Page({
  open,
  onCloseAutoFocus,
}: {
  open: boolean;
  onCloseAutoFocus?: (e: Event) => void;
}) {
  return (
    <>
      <button type="button" id="was-here">
        a row the person was on
      </button>
      <CommandPalette
        open={open}
        kernel={kernel}
        ctx={ctx}
        roots={roots}
        {...(onCloseAutoFocus && { onCloseAutoFocus })}
        onClose={() => {}}
        onResult={() => {}}
        onExecuted={() => {}}
      />
    </>
  );
}

const dialogs = () => document.querySelectorAll('[role="dialog"]').length;

/** Let timers and animations run (the exit is a spring), up to `ms`, until `done` holds. */
async function settle(done: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !done(); t += 50) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
}

describe("CommandPalette - focus goes back where it was", () => {
  it("closing the palette puts focus back on the element that had it before it opened", async () => {
    const view = render(<Page open={false} />);
    const before = document.getElementById("was-here") as HTMLButtonElement;
    before.focus();
    expect(document.activeElement).toBe(before);

    view.rerender(<Page open />);
    await settle(() => document.activeElement?.tagName === "INPUT");
    expect(document.activeElement?.tagName).toBe("INPUT");

    view.rerender(<Page open={false} />);
    // after the exit animation the dialog unmounts and focus is handed back
    await settle(() => dialogs() === 0);
    await settle(() => false, 100);
    expect(dialogs()).toBe(0);
    expect(document.activeElement).toBe(before);
  });

  it("onCloseAutoFocus is told, and can take focus itself with preventDefault", async () => {
    const calls: Event[] = [];
    const view = render(<Page open={false} />);
    const before = document.getElementById("was-here") as HTMLButtonElement;
    before.focus();
    view.rerender(<Page open />);
    await settle(() => document.activeElement?.tagName === "INPUT");

    const mine = (e: Event) => {
      calls.push(e);
      e.preventDefault(); // the host puts focus somewhere itself (here: nowhere)
    };
    view.rerender(<Page open={false} onCloseAutoFocus={mine} />);
    await settle(() => calls.length > 0);
    await settle(() => false, 100);
    expect(calls.length).toBe(1);
    expect(document.activeElement).not.toBe(before);
  });
});
