// happy-dom must be installed BEFORE @testing-library/react evaluates (see dom-setup.ts)
import "../../../test/dom-setup.js";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { ArgValues, CommandNode, CommandResult, Ctx, Piped } from "@command-kernel/core";
import { createKernel } from "@command-kernel/core";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { registerDom, unregisterDom } from "../../../test/dom-setup.js";
import { usePalette } from "./usePalette.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => registerDom());
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 40));
});
afterAll(() => unregisterDom());

/** Pipe mode, driven through the palette's own hook: file -> text -> ciphertext -> email. */

const file: Piped = {
  type: { kind: "entity", entity: { type: "file" } },
  value: "notes.md",
  label: "notes.md",
};

const ran: Record<string, ArgValues> = {};

const load: CommandNode = {
  id: "load",
  title: "Load as text",
  args: [{ id: "file", label: "file", kind: "entity", required: true, entity: { type: "file" } }],
  output: { kind: "text", label: "file contents" },
  run: async (a) => {
    ran.load = a;
    return { kind: "data", message: "loaded", value: "hello" };
  },
};

const seal: CommandNode = {
  id: "seal",
  title: "Encrypt",
  args: [
    { id: "text", label: "text", kind: "text", required: true },
    { id: "to", label: "for", kind: "string", required: true },
  ],
  input: "text",
  output: { kind: "text", label: "ciphertext" },
  run: async (a) => {
    ran.seal = a;
    return { kind: "data", message: "sealed", value: `enc(${a.text})` };
  },
};

/** gated and one level down, so its grant binds to a path the browse frames never walked */
const send: CommandNode = {
  id: "send",
  title: "Send",
  gate: { confirm: true },
  args: [{ id: "body", label: "body", kind: "text", required: true }],
  run: async (a) => {
    ran.send = a;
    return { kind: "toast", message: "sent" };
  },
};
const mail: CommandNode = { id: "mail", title: "Mail", resolve: async () => [send] };

const ROOTS = [load, seal, mail];
const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

function mount() {
  const results: CommandResult[] = [];
  let closed = 0;
  const kernel = createKernel({ roots: ROOTS });
  const hooks = {
    kernel,
    ctx,
    roots: ROOTS,
    open: true,
    onResult: (r: CommandResult) => results.push(r),
    onExecuted: () => {},
    onClose: () => {
      closed++;
    },
  };
  const view = renderHook(() => usePalette(hooks));
  return { view, results, closed: () => closed };
}

const rowFor = (view: ReturnType<typeof mount>["view"], id: string) => {
  const row = view.result.current.pipeRows.find((r) => r.node.id === id);
  if (!row) throw new Error(`no pipe row for ${id}`);
  return row;
};

test("a file in hand lists what takes it; a command that makes text keeps the palette open on it", async () => {
  const { view, results, closed } = mount();
  act(() => view.result.current.startPipe(file));
  expect(view.result.current.mode).toBe("pipe");
  await waitFor(() => expect(view.result.current.pipeRows.map((r) => r.node.id)).toEqual(["load"]));

  await act(async () => view.result.current.pick(rowFor(view, "load").action));
  await waitFor(() => expect(view.result.current.pipe?.subject.value).toBe("hello"));
  expect(ran.load).toEqual({ file: "notes.md" });
  expect(view.result.current.pipe?.trail).toEqual(["notes.md", "Load as text"]);
  expect(view.result.current.mode).toBe("pipe");
  expect(results.map((r) => r.message)).toEqual(["loaded"]);
  expect(closed()).toBe(0);
});

test("text in hand: Encrypt asks only for the rest, a gated Send binds its grant to its own path", async () => {
  const { view, closed } = mount();
  act(() => view.result.current.startPipe({ type: { kind: "text" }, value: "hi" }));
  await waitFor(() =>
    expect(view.result.current.pipeRows.map((r) => r.node.id).sort()).toEqual(["seal", "send"]),
  );

  await act(async () => view.result.current.pick(rowFor(view, "seal").action));
  expect(view.result.current.mode).toBe("args");
  expect(view.result.current.arg?.activeArg).toBe("to");
  await act(async () => view.result.current.commitArg("jo@example.com"));
  await waitFor(() => expect(view.result.current.pipe?.subject.value).toBe("enc(hi)"));
  expect(ran.seal).toEqual({ text: "hi", to: "jo@example.com" });

  await waitFor(() => expect(view.result.current.pipeRows.length).toBeGreaterThan(0));
  await act(async () => view.result.current.pick(rowFor(view, "send").action));
  await waitFor(() => expect(view.result.current.mode).toBe("confirm"));

  // backing out of a pipe step returns to the value in hand, not the browse list
  act(() => view.result.current.back());
  expect(view.result.current.mode).toBe("pipe");

  await act(async () => view.result.current.pick(rowFor(view, "send").action));
  await waitFor(() => expect(view.result.current.mode).toBe("confirm"));
  await act(async () => view.result.current.confirmProceed());
  await waitFor(() => expect(ran.send).toEqual({ body: "enc(hi)" }));
  expect(closed()).toBe(1);
});

test("Esc steps back one value at a time; only the first step returns to browse", async () => {
  const { view } = mount();
  act(() => view.result.current.startPipe(file));
  await waitFor(() => expect(view.result.current.pipeRows.length).toBe(1));
  await act(async () => view.result.current.pick(rowFor(view, "load").action));
  await waitFor(() => expect(view.result.current.pipe?.subject.value).toBe("hello"));

  act(() => view.result.current.back());
  expect(view.result.current.mode).toBe("pipe");
  expect(view.result.current.pipe?.subject).toEqual(file);
  expect(view.result.current.pipe?.trail).toEqual(["notes.md"]);

  act(() => view.result.current.back());
  expect(view.result.current.mode).toBe("browse");
  expect(view.result.current.pipe).toBeNull();
});
