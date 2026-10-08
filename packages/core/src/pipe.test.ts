import { beforeEach, describe, expect, it } from "bun:test";
import type { ArgSpec } from "./args.js";
import type { CommandRecord } from "./audit.js";
import { replay } from "./audit.js";
import { createKernel } from "./create-kernel.js";
import { describeNode } from "./describe.js";
import {
  aFile,
  aPerson,
  ctx,
  encrypt,
  fileEntity,
  personEntity,
  ROOTS,
  readFile,
  seen,
  sendEmail,
} from "./pipe.fixtures.test-util.js";
import { acceptingArg, accepts } from "./pipe.js";
import type { CommandNode } from "./types.js";

const kernel = (onExecute?: (r: CommandRecord) => void) =>
  createKernel({
    roots: ROOTS,
    entities: [fileEntity, personEntity],
    ...(onExecute && { onExecute }),
  });

beforeEach(() => {
  for (const k of Object.keys(seen)) delete seen[k];
});

const arg = (a: Partial<ArgSpec> & Pick<ArgSpec, "kind">): ArgSpec => ({
  id: "a",
  label: "a",
  ...a,
});

describe("which arg a piped value lands in", () => {
  it("an entity needs the same entity type; text flows into text; an enum takes nothing", () => {
    const person = aPerson("x").type;
    expect(accepts(arg({ kind: "entity", entity: { type: "person" } }), person)).toBe(true);
    expect(accepts(arg({ kind: "entity", entity: { type: "file" } }), person)).toBe(false);
    expect(accepts(arg({ kind: "string" }), person)).toBe(false);
    expect(accepts(arg({ kind: "text" }), { kind: "email" })).toBe(true);
    expect(accepts(arg({ kind: "email" }), { kind: "text" })).toBe(false);
    expect(accepts(arg({ kind: "enum" }), { kind: "string" })).toBe(false);
    expect(accepts(arg({ kind: "number" }), { kind: "number" })).toBe(true);
    expect(accepts(arg({ kind: "string" }), { kind: "string", multiple: true })).toBe(false);
    expect(accepts(arg({ kind: "string", multiple: true }), { kind: "string" })).toBe(true);
  });

  it("a person lands in `to`, a file in `attachments`, text in the declared `body`", () => {
    expect(acceptingArg(sendEmail, aPerson("x").type)?.id).toBe("to");
    expect(acceptingArg(sendEmail, aFile("x").type)?.id).toBe("attachments");
    expect(acceptingArg(sendEmail, { kind: "text" })?.id).toBe("body");
  });

  it("of two args that fit, the one made for the value wins; two of those is no guess", () => {
    const node: CommandNode = {
      id: "n",
      title: "N",
      args: [arg({ id: "x", kind: "text" }), arg({ id: "y", kind: "string" })],
    };
    expect(acceptingArg(node, { kind: "text" })?.id).toBe("x");
    expect(acceptingArg({ ...node, input: "y" }, { kind: "text" })?.id).toBe("y");
    const twins: CommandNode = {
      ...node,
      args: [arg({ id: "x", kind: "text" }), arg({ id: "z", kind: "text" })],
    };
    expect(acceptingArg(twins, { kind: "text" })).toBeNull();
  });
});

describe("command() with a piped input", () => {
  it("[contact] => Send email: the contact is the recipient, the rest is still asked for", async () => {
    const res = await kernel().command(
      { path: [{ id: "email.send" }], input: aPerson("ada@x.io"), execute: true },
      ctx,
    );
    expect(res.kind).toBe("args");
    if (res.kind === "args") expect(res.missing).toEqual(["subject"]);
  });

  it("[file] => Send email > to: j@duplo.org - the file is attached and the grant covers it", async () => {
    const k = kernel();
    const path = [{ id: "email.send", args: { to: "j@duplo.org", subject: "hi" } }];
    const gate = await k.command({ path, input: aFile("notes.md"), execute: true }, ctx);
    expect(gate.kind).toBe("gate");
    if (gate.kind !== "gate") return;
    expect(gate.args.attachments).toEqual(["notes.md"]);

    const grant = k.grantFor(gate);
    const tip = { ...path[0], evidence: grant } as (typeof path)[number];
    const ran = await k.command({ path: [tip], input: aFile("notes.md"), execute: true }, ctx);
    expect(ran.kind).toBe("result");
    expect(seen["email.send"]).toMatchObject({ to: "j@duplo.org", attachments: ["notes.md"] });

    // the same grant does not cover a different file
    const other = await k.command({ path: [tip], input: aFile("plan.txt"), execute: true }, ctx);
    expect(other.kind).toBe("gate");
  });

  it("a piped value that disagrees with one written by hand is refused, not picked", async () => {
    const res = await kernel().command(
      {
        path: [{ id: "email.send", args: { to: "bob@x.io" } }],
        input: aPerson("ada@x.io"),
        execute: true,
      },
      ctx,
    );
    expect(res.kind).toBe("args");
    if (res.kind === "args") expect(res.errors[0]?.message).toBe("to already has a value");
  });

  it("a value nothing takes is an args error naming the type", async () => {
    const res = await kernel().command(
      {
        path: [{ id: "email.send" }],
        input: { type: { kind: "number" }, value: 4 },
        execute: true,
      },
      ctx,
    );
    expect(res.kind).toBe("args");
    if (res.kind === "args") expect(res.errors[0]?.message).toBe("Send email does not take number");
  });

  it("the audit record carries the input, and replay binds it again", async () => {
    const records: CommandRecord[] = [];
    const k = kernel((r) => records.push(r));
    const path = [{ id: "tools" }, { id: "files.read" }];
    await k.command({ path, input: aFile("plan.txt"), execute: true }, ctx);
    expect(records[0]?.input).toEqual(aFile("plan.txt"));
    const again = await replay(k, records[0] as CommandRecord, ctx);
    expect(again.kind === "result" && again.result.value).toBe("ship it");
  });
});

describe("kernel.pipe", () => {
  const read = { path: [{ id: "tools" }, { id: "files.read" }] };
  const seal = { path: [{ id: "tools" }, { id: "crypto.encrypt", args: { to: "j@duplo.org" } }] };
  const mail = { path: [{ id: "email.send", args: { to: "j@duplo.org", subject: "secret" } }] };

  it("file => load as text => encrypt: each step's output is the next one's input", async () => {
    const res = await kernel().pipe({ input: aFile("notes.md"), steps: [read, seal] }, ctx);
    expect(res.kind).toBe("done");
    if (res.kind !== "done") return;
    expect(res.output).toEqual({
      type: { kind: "text", label: "ciphertext" },
      value: "enc(hello)",
      label: "ciphertext",
    });
    expect(seen["crypto.encrypt"]).toEqual({ text: "hello", to: "j@duplo.org" });
  });

  it("pauses at the gate, and resumes from there without re-running what ran", async () => {
    const k = kernel();
    const first = await k.pipe({ input: aFile("notes.md"), steps: [read, seal, mail] }, ctx);
    expect(first.kind).toBe("paused");
    if (first.kind !== "paused" || first.response.kind !== "gate") return;
    expect(first.step).toBe(2);
    expect(first.response.args.body).toBe("enc(hello)");

    delete seen["files.read"];
    const resume = first.resume;
    const tip = resume.steps[0]?.path.at(-1);
    if (tip) tip.evidence = k.grantFor(first.response);
    const done = await k.pipe(resume, ctx);
    expect(done.kind).toBe("done");
    expect(seen["files.read"]).toBeUndefined();
    expect(seen["email.send"]).toMatchObject({ body: "enc(hello)", to: "j@duplo.org" });
  });

  it("a pipe that cannot type-check runs nothing", async () => {
    const res = await kernel().pipe({ input: aFile("notes.md"), steps: [mail, read] }, ctx);
    expect(res).toMatchObject({
      kind: "broken",
      step: 0,
      reason: "Send email produces nothing to pipe on",
    });
    expect(seen).toEqual({});

    const wrong = await kernel().pipe({ input: aPerson("ada@x.io"), steps: [read] }, ctx);
    expect(wrong).toMatchObject({ kind: "broken", reason: "Load as text does not take a person" });
  });

  it("an output that is not what the node promised stops the pipe there", async () => {
    const liar: CommandNode = {
      ...readFile,
      id: "liar",
      run: async () => ({ kind: "data", message: "", value: 42 }),
    };
    const k = createKernel({ roots: [liar, encrypt], entities: [fileEntity, personEntity] });
    const res = await k.pipe(
      {
        input: aFile("notes.md"),
        steps: [
          { path: [{ id: "liar" }] },
          { path: [{ id: "crypto.encrypt", args: { to: "j@duplo.org" } }] },
        ],
      },
      ctx,
    );
    expect(res).toMatchObject({
      kind: "broken",
      step: 0,
      reason: "Load as text: file contents must be text",
    });
    expect(seen["crypto.encrypt"]).toBeUndefined();
  });
});

describe("kernel.actionsFor - incoming routing", () => {
  it("finds every command that takes a value, through free branches only", async () => {
    const forFile = await kernel().actionsFor(aFile("x").type, ctx);
    expect(forFile.map((a) => a.node.id).sort()).toEqual(["email.send", "files.read"]);
    // the copy behind the "search" query branch is reached by searching, not by routing
    const forPerson = await kernel().actionsFor(aPerson("x").type, ctx);
    expect(forPerson.map((a) => a.node.id).sort()).toEqual(["crypto.encrypt", "email.send"]);
  });

  it("with nothing typed, a command made for the value outranks one that can merely hold it", async () => {
    const lookup: CommandNode = {
      id: "lookup",
      title: "Lookup",
      weight: 99,
      args: [{ id: "q", label: "q", kind: "string", positional: true }],
      run: async () => ({ kind: "page", message: "" }),
    };
    const k = createKernel({ roots: [lookup, encrypt] });
    const ids = async (q?: string) =>
      (await k.actionsFor({ kind: "text" }, ctx, q)).map((a) => a.node.id);
    expect(await ids()).toEqual(["crypto.encrypt", "lookup"]);
    // once you type, what you typed decides
    expect(await ids("look")).toEqual(["lookup"]);
  });

  it("an action's path and priorKey are what command() walks and binds a grant to", async () => {
    const k = kernel();
    const [action] = await k.actionsFor(aFile("x").type, ctx, "load");
    expect(action?.node.id).toBe("files.read");
    expect(action?.path).toEqual([{ id: "tools" }, { id: "files.read" }]);
    const gated = await k.command(
      { path: action?.path ?? [], input: aFile("notes.md"), execute: true, dryRun: true },
      ctx,
    );
    expect(gated.kind === "gate" && gated.priorKey).toBe(action?.priorKey as string);
  });
});

describe("self-description", () => {
  it("an agent reads what a node outputs and where its input lands", () => {
    expect(describeNode(readFile).output).toEqual({ kind: "text", label: "file contents" });
    expect(describeNode(sendEmail).input).toBe("body");
  });
});
