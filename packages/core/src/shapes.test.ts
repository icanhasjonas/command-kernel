import { describe, expect, it } from "bun:test";
import type { ArgSpec, Piped } from "./args.js";
import { createKernel } from "./create-kernel.js";
import { createEntityRegistry, type EntityType } from "./entity.js";
import { acceptingArg, accepts } from "./pipe.js";
import type { CommandNode, Ctx } from "./types.js";

/** Shapes: a media file IS a file; a file is not a media file. */

const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

const catalog = (name: string, ids: string[], parents?: EntityType["extends"]): EntityType => ({
  name,
  ...(parents !== undefined && { extends: parents }),
  search: async (q) => ids.filter((id) => id.includes(q)).map((id) => ({ id, label: id })),
  get: async (id) => (ids.includes(id) ? { id, label: id } : null),
});

// `file` is abstract: it has no catalog, only the shapes that extend it do
const file: EntityType = { name: "file" };
const doc = catalog("doc-file", ["notes.md"], "file");
const media = catalog("media-file", ["demo.mp4"], "file");
const video = catalog("video", ["clip.mov"], ["media-file"]);

const a = (type: string, value: string): Piped => ({
  type: { kind: "entity", entity: { type } },
  value,
});

describe("the registry knows the shapes", () => {
  const reg = createEntityRegistry(file, doc, media, video);

  it("isA is reflexive and transitive, and never runs backwards", () => {
    expect(reg.isA("media-file", "media-file")).toBe(true);
    expect(reg.isA("media-file", "file")).toBe(true);
    expect(reg.isA("video", "file")).toBe(true);
    expect(reg.isA("file", "media-file")).toBe(false);
    expect(reg.isA("doc-file", "media-file")).toBe(false);
  });

  it("a cycle in the declarations ends the walk instead of hanging it", () => {
    const loop = createEntityRegistry({ name: "a", extends: "b" }, { name: "b", extends: "a" });
    expect(loop.isA("a", "b")).toBe(true);
    expect(loop.isA("a", "c")).toBe(false);
  });

  it("searching a shape searches every shape that extends it, stamped with what it is", async () => {
    const all = await reg.search("file", "", ctx);
    expect(all.map((e) => [e.id, e.type])).toEqual([
      ["notes.md", "doc-file"],
      ["demo.mp4", "media-file"],
      ["clip.mov", "video"],
    ]);
    expect((await reg.search("media-file", "", ctx)).map((e) => e.id)).toEqual([
      "demo.mp4",
      "clip.mov",
    ]);
  });

  it("a shape's catalog hydrates the ids of its sub-shapes, never the other way", async () => {
    expect((await reg.get("file", "clip.mov", ctx))?.type).toBe("video");
    expect(await reg.get("media-file", "notes.md", ctx)).toBeNull();
  });
});

describe("routing is covariant", () => {
  const reg = createEntityRegistry(file, doc, media, video);
  const fileArg: ArgSpec = { id: "f", label: "file", kind: "entity", entity: { type: "file" } };
  const mediaArg: ArgSpec = {
    id: "m",
    label: "media",
    kind: "entity",
    entity: { type: "media-file" },
  };
  const attach: CommandNode = {
    id: "attach",
    title: "Attach",
    args: [fileArg],
    run: async () => ({ kind: "noop", message: "" }),
  };
  const thumb: CommandNode = {
    id: "thumb",
    title: "Make thumbnail",
    args: [mediaArg],
    run: async () => ({ kind: "noop", message: "" }),
  };

  it("a media file fits a file arg; a file does not fit a media-file arg", () => {
    expect(accepts(fileArg, a("media-file", "x").type, reg.isA)).toBe(true);
    expect(accepts(mediaArg, a("file", "x").type, reg.isA)).toBe(false);
    // without the registry a shape is only itself
    expect(accepts(fileArg, a("media-file", "x").type)).toBe(false);
  });

  it("the arg made for the exact shape wins over one that merely holds it", () => {
    const both: CommandNode = {
      id: "both",
      title: "Both",
      args: [fileArg, mediaArg],
    };
    expect(acceptingArg(both, a("video", "x").type, reg.isA)).toBeNull();
    expect(acceptingArg(both, a("media-file", "x").type, reg.isA)?.id).toBe("m");
    expect(acceptingArg(both, a("doc-file", "x").type, reg.isA)?.id).toBe("f");
  });

  it("the kernel routes and runs with its registry's shapes", async () => {
    const k = createKernel({ roots: [attach, thumb], entities: [file, doc, media, video] });
    const forMedia = await k.actionsFor(a("media-file", "x").type, ctx);
    expect(forMedia.map((x) => x.node.id).sort()).toEqual(["attach", "thumb"]);
    const forDoc = await k.actionsFor(a("doc-file", "x").type, ctx);
    expect(forDoc.map((x) => x.node.id)).toEqual(["attach"]);

    const ran = await k.command(
      { path: [{ id: "attach" }], input: a("video", "clip.mov"), execute: true },
      ctx,
    );
    expect(ran.kind).toBe("result");
    const refused = await k.command(
      { path: [{ id: "thumb" }], input: a("doc-file", "notes.md"), execute: true },
      ctx,
    );
    expect(refused.kind === "args" && refused.errors[0]?.message).toBe(
      "Make thumbnail does not take a doc-file",
    );

    const piped = await k.pipe(
      { input: a("doc-file", "notes.md"), steps: [{ path: [{ id: "thumb" }] }] },
      ctx,
    );
    expect(piped).toMatchObject({
      kind: "broken",
      reason: "Make thumbnail does not take a doc-file",
    });
  });
});
