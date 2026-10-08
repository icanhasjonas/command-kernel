import type { CommandNode, Entity, EntityType, Piped } from "@command-kernel/core";
import { ICON, type Shape, type WorkspaceFile, workspace } from "./workspace";

/**
 * The workspace as SHAPES the kernel knows: `file` is abstract (no catalog of its
 * own), `document` and `media-file` extend it, `image` extends `media-file`. An arg
 * that asks for a `file` takes any of them (Send email's attachments); one that asks
 * for a `media-file` takes media and images, never a document (Make thumbnail).
 *
 *   [launch-notes.md] -> Load as text -> Encrypt for… -> Send email
 *   [launch-teaser.mp4] -> Make thumbnail -> Send email (an image is a file)
 */

const toEntity = (f: WorkspaceFile): Entity => ({
  id: f.id,
  label: f.id,
  hint: `${f.shape} · ${f.size}`,
  icon: ICON[f.shape],
});

/** One registered shape: its own files, and where it sits in the tree. */
function shapeCatalog(name: Shape, parent: string): EntityType {
  return {
    name,
    extends: parent,
    async search(query) {
      const q = query.trim().toLowerCase();
      return workspace
        .ofShape(name)
        .filter((f) => f.id.includes(q))
        .map(toEntity);
    },
    async get(id) {
      const f = workspace.find(id);
      return f?.shape === name ? toEntity(f) : null;
    },
  };
}

export const FILE_SHAPES: EntityType[] = [
  { name: "file" },
  shapeCatalog("document", "file"),
  shapeCatalog("media-file", "file"),
  shapeCatalog("image", "media-file"),
];

/** A workspace file as a value you can hand to a command, typed as what it IS. */
export const fileSubject = (f: WorkspaceFile): Piped => ({
  type: { kind: "entity", entity: { type: f.shape } },
  value: f.id,
  label: f.id,
});

export const readFile: CommandNode = {
  id: "files.read",
  title: "Load as text",
  subtitle: "document → text",
  summary:
    "Read a document and hand its contents on as text, ready to pipe into Encrypt or Send email. Takes documents only: a video has no text to load. Reads only.",
  category: "Files",
  icon: "FileInput",
  weight: 30,
  effect: "pure",
  args: [
    {
      id: "file",
      label: "document",
      kind: "entity",
      required: true,
      placeholder: "which document…",
      entity: { type: "document" },
    },
  ],
  output: { kind: "text", label: "file contents" },
  run: async (a) => {
    const contents = workspace.find(String(a.file))?.contents ?? "";
    return {
      kind: "data",
      message: `Loaded ${a.file} · ${contents.length} chars`,
      value: contents,
    };
  },
};

export const filesCategory: CommandNode = {
  id: "files",
  title: "Files",
  subtitle: "documents · media · images",
  summary:
    "Files in the workspace, each typed by shape (document, media-file, image - all of them files). Each one is a subject: pick it, then pipe it into any command that takes its shape.",
  icon: "FolderOpen",
  weight: 46,
  enumerate: "free",
  resolve: async () => [
    ...workspace.all().map(
      (f): CommandNode => ({
        id: `files.entity.${f.id}`,
        title: f.id,
        subtitle: `${f.shape} · ${f.size}`,
        icon: ICON[f.shape],
        keywords: ["file", f.shape],
        // the files are what you came to this folder for; the commands come after them
        weight: 40,
        subject: fileSubject(f),
      }),
    ),
    readFile,
  ],
};
