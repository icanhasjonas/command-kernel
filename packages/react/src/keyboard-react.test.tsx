// happy-dom must be installed BEFORE @testing-library/react evaluates (see test/dom-setup.ts).
// Keys are heard on `document`: under happy-dom `window` is Bun's own globalThis, which a
// keydown fired on an element never bubbles to. In a browser the default (`window`) is right.
import "../../../test/dom-setup.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
  type CommandNode,
  type Ctx,
  createKeyboard,
  type Keyboard,
  type ScopeBinding,
} from "@command-kernel/core";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type ReactNode, StrictMode, useState } from "react";
import { createPortal } from "react-dom";
import { registerDom, unregisterDom } from "../../../test/dom-setup.js";
import { attachKeyboard, type KeySource } from "./attach-keyboard.js";
import { KeyboardLayer } from "./KeyboardLayer.js";
import { KeyboardProvider } from "./KeyboardProvider.js";
import { KeyboardScope } from "./KeyboardScope.js";
import { useKeyboardStack } from "./use-keyboard-stack.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// the setup module is shared and cached: another file's afterAll may have unregistered it
beforeAll(() => registerDom());
afterEach(() => cleanup());
afterAll(() => unregisterDom());

const press = (key: string) => fireEvent.keyDown(document.body, { key });

/** a keyboard, a log, and `on(name)` handlers that write to it */
function rig() {
  const keyboard = createKeyboard();
  const hits: string[] = [];
  const on = (name: string) => () => {
    hits.push(name);
  };
  const app = (children: ReactNode) => (
    <KeyboardProvider keyboard={keyboard} source={document}>
      {children}
    </KeyboardProvider>
  );
  return { keyboard, hits, on, app };
}

const layerIds = (kb: Keyboard) => kb.describeStack().layers.map((l) => l.id);

describe("L15 attachKeyboard is the one listener, in the bubble phase", () => {
  it("adds one keydown listener without capture, and removes it", () => {
    const { keyboard, hits, on } = rig();
    keyboard.pushLayer({ x: on("x") });
    const calls: string[] = [];
    let heard: Parameters<KeySource["addEventListener"]>[1] | undefined;
    const source: KeySource = {
      addEventListener(type, fn, ...rest: unknown[]) {
        calls.push(`add ${type} ${rest.length}`);
        heard = fn;
      },
      removeEventListener(type, fn) {
        calls.push(`remove ${type} ${fn === heard}`);
      },
    };
    const detach = attachKeyboard(keyboard, source);
    heard?.(new KeyboardEvent("keydown", { key: "x" }));
    detach();
    expect(hits).toEqual(["x"]);
    expect(calls).toEqual(["add keydown 0", "remove keydown true"]);
  });

  it("a browser window is a KeySource as it is (checked by tsc: this line must compile)", () => {
    const source: KeySource = window;
    expect(source).toBe(window);
  });
});

describe("KeyboardProvider", () => {
  it("hears keys on its source, and stops on unmount", () => {
    const { hits, on, app } = rig();
    const view = render(app(<KeyboardLayer bindings={{ Escape: on("close") }} />));
    press("Escape");
    view.unmount();
    press("Escape");
    expect(hits).toEqual(["close"]);
  });
});

/** a screen, a modal dialog in it, and a popover in the dialog rendered through a portal */
function Nested({ on, popover }: { on: (n: string) => () => void; popover: boolean }) {
  return (
    <KeyboardLayer bindings={{ Escape: on("back"), j: on("next") }}>
      <KeyboardLayer bindings={{ Escape: on("close dialog") }} modal passThrough={["mod+k"]}>
        {popover &&
          createPortal(<KeyboardLayer bindings={{ Escape: on("close popover") }} />, document.body)}
      </KeyboardLayer>
    </KeyboardLayer>
  );
}

describe("L3 in React: the tree is the stack, whatever order effects run in", () => {
  for (const strict of [false, true]) {
    it(`screen < dialog < popover, mounted in one render${strict ? " (StrictMode)" : ""}`, () => {
      const { keyboard, hits, on, app } = rig();
      const tree = (popover: boolean) => {
        const el = app(<Nested on={on} popover={popover} />);
        return strict ? <StrictMode>{el}</StrictMode> : el;
      };
      const view = render(tree(true));
      expect(layerIds(keyboard)).toHaveLength(3);
      press("Escape");
      view.rerender(tree(false));
      press("Escape");
      press("j"); // the dialog is modal: the screen's j never fires
      expect(hits).toEqual(["close popover", "close dialog"]);
    });
  }
});

describe("L17 in React: a layer keeps its place while its keys and options change", () => {
  function Screen({
    on,
    extra,
    palette,
  }: {
    on: (n: string) => () => void;
    extra: boolean;
    palette: boolean;
  }) {
    return (
      <>
        <KeyboardLayer
          id="screen"
          bindings={extra ? { j: on("next"), r: on("reply") } : { j: on("next") }}
        >
          <KeyboardLayer id="dialog" bindings={{ Escape: on("dialog") }} modal />
        </KeyboardLayer>
        {palette && <KeyboardLayer id="palette" bindings={{ Escape: on("palette") }} modal />}
      </>
    );
  }

  it("the screen's keys change under an open palette, and the palette keeps Escape", () => {
    const { keyboard, hits, on, app } = rig();
    const view = render(app(<Screen on={on} extra={false} palette={false} />));
    view.rerender(app(<Screen on={on} extra={false} palette />));
    view.rerender(app(<Screen on={on} extra palette />));
    press("Escape");
    expect(hits).toEqual(["palette"]);
    expect(layerIds(keyboard)).toEqual(["palette", "dialog", "screen"]);
  });

  it("useKeyboardStack shows the new keys", () => {
    const { on, app } = rig();
    function Hints() {
      return (
        <p>
          {useKeyboardStack()
            .reachable.map((r) => r.binding)
            .join(" ")}
        </p>
      );
    }
    const tree = (extra: boolean) =>
      app(
        <>
          <KeyboardLayer bindings={extra ? { j: on("j"), r: on("r") } : { j: on("j") }} />
          <Hints />
        </>,
      );
    const view = render(tree(false));
    view.rerender(tree(true));
    expect(view.container.textContent).toBe("j r");
  });

  it("a disabled layer is not on the stack, and what is inside it attaches to the next one out", () => {
    const { keyboard, app } = rig();
    render(
      app(
        <KeyboardLayer id="outer" bindings={{}}>
          <KeyboardLayer id="off" bindings={{}} enabled={false}>
            <KeyboardLayer id="inner" bindings={{}} />
          </KeyboardLayer>
        </KeyboardLayer>,
      ),
    );
    const layers = keyboard.describeStack().layers;
    expect(layers.map((l) => l.id)).toEqual(["inner", "outer"]);
    expect(layers[0]?.parent).toBe("outer");
  });
});

describe("a layer keeps its place and its keys across renders", () => {
  it("a new handler runs without a re-push", () => {
    const { keyboard, hits, app } = rig();
    function Counter() {
      const [n, setN] = useState(0);
      return <KeyboardLayer bindings={{ "+": () => hits.push(`at ${n}`) && setN(n + 1) }} />;
    }
    render(app(<Counter />));
    let changes = 0;
    keyboard.subscribeStack(() => changes++);
    act(() => void press("+"));
    act(() => void press("+"));
    expect(hits).toEqual(["at 0", "at 1"]);
    expect(changes).toBe(0);
  });
});

describe("L13 in React: KeyboardScope mounts a scope's commands", () => {
  const ctx: Ctx = {
    location: { module: "mail" },
    user: { id: "u", name: "U", role: "admin", brand: "b" },
    now: 0,
    frecency: {},
  };
  const nodes: CommandNode[] = [
    { id: "back", title: "Back", shortcut: "Escape", scope: "thread" },
    { id: "discard", title: "Discard", shortcut: "Escape", scope: "editor" },
  ];

  it("the scope's keys win while it is mounted, and are gone after", () => {
    const keyboard = createKeyboard();
    const hits: string[] = [];
    const scopes = keyboard.bindScopes({
      nodes,
      scopes: ["thread"],
      mounted: ["editor"],
      ctx: () => ctx,
      activeScopes: () => ["thread"],
      onActivate: (n) => hits.push(n.id),
    });
    const tree = (open: boolean) => (
      <KeyboardProvider keyboard={keyboard} scopes={scopes} source={document}>
        {open && <KeyboardScope scope="editor" modal />}
      </KeyboardProvider>
    );
    const view = render(tree(true));
    press("Escape");
    view.rerender(tree(false));
    press("Escape");
    expect(hits).toEqual(["discard", "back"]);
  });
});

describe("L13 in React: a KeyboardScope follows its binding and its scope", () => {
  const ctx: Ctx = {
    location: { module: "mail" },
    user: { id: "u", name: "U", role: "admin", brand: "b" },
    now: 0,
    frecency: {},
  };
  const bind = (keyboard: Keyboard, hits: string[], nodes: CommandNode[]) =>
    keyboard.bindScopes({
      nodes,
      scopes: [],
      mounted: ["one", "two"],
      ctx: () => ctx,
      activeScopes: () => [],
      onActivate: (n) => hits.push(n.id),
    });

  it("a new binding on the provider re-mounts the scope from it; so does a new scope prop", () => {
    const keyboard = createKeyboard();
    const hits: string[] = [];
    const old = bind(keyboard, hits, [{ id: "old", title: "", shortcut: "a", scope: "one" }]);
    const tree = (scopes: ScopeBinding, scope: string) => (
      <KeyboardProvider keyboard={keyboard} scopes={scopes} source={document}>
        <KeyboardScope id="panel" scope={scope} modal />
      </KeyboardProvider>
    );
    const view = render(tree(old, "one"));
    old.dispose();
    const next = bind(keyboard, hits, [
      { id: "new one", title: "", shortcut: "a", scope: "one" },
      { id: "new two", title: "", shortcut: "a", scope: "two" },
    ]);
    view.rerender(tree(next, "one"));
    press("a");
    view.rerender(tree(next, "two"));
    press("a");
    expect(hits).toEqual(["new one", "new two"]);
    expect(layerIds(keyboard)).toEqual(["panel"]);
  });
});

describe("L17 in React: owners change in place", () => {
  it("switching off an ancestor does not lift its dialog above a palette opened after it", () => {
    const { keyboard, hits, on, app } = rig();
    const tree = (outer: boolean, palette: boolean) =>
      app(
        <>
          <KeyboardLayer id="outer" bindings={{}} enabled={outer}>
            <KeyboardLayer id="dialog" bindings={{ Escape: on("dialog") }} modal />
          </KeyboardLayer>
          {palette && <KeyboardLayer id="palette" bindings={{ Escape: on("palette") }} modal />}
        </>,
      );
    const view = render(tree(true, false));
    view.rerender(tree(true, true));
    view.rerender(tree(false, true));
    press("Escape");
    expect(hits).toEqual(["palette"]);
    expect(layerIds(keyboard)).toEqual(["palette", "dialog"]);
  });
});

describe("L14 in React: useKeyboardStack re-renders on push and pop", () => {
  it("shows the dialog's keys while it is open", () => {
    const { on, app } = rig();
    function Hints() {
      const { reachable } = useKeyboardStack();
      return <p>{reachable.map((r) => r.binding).join(" ")}</p>;
    }
    const tree = (open: boolean) =>
      app(
        <>
          <KeyboardLayer bindings={{ j: on("next"), "mod+k": on("palette") }} />
          {open && (
            <KeyboardLayer bindings={{ Escape: on("close") }} modal passThrough={["mod+k"]} />
          )}
          <Hints />
        </>,
      );
    const view = render(tree(false));
    expect(view.container.textContent).toBe("j mod+k");
    view.rerender(tree(true));
    expect(view.container.textContent).toBe("Escape mod+k");
  });
});
