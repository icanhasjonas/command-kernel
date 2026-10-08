import type { CommandNode, Entity, EntityType, Piped } from "@command-kernel/core";

/**
 * A tiny workspace of files: the `file` entity type, the Files category (each file
 * is a SUBJECT you can pipe into a command), and "Load as text", which turns a file
 * into text the next command can take.
 *
 *   [notes.md] -> Load as text -> Encrypt for… -> Send email
 */

interface WorkspaceFile {
  id: string;
  size: string;
  contents: string;
}

const FILES: WorkspaceFile[] = [
  {
    id: "launch-notes.md",
    size: "1.2 KB",
    contents: "Launch is Thursday 10:00. Keep the pricing page dark until the press embargo lifts.",
  },
  {
    id: "q3-forecast.csv",
    size: "4.8 KB",
    contents: "month,signups,churn\njul,412,3.1\naug,498,2.8\nsep,566,2.6",
  },
  {
    id: "contract-draft.txt",
    size: "9.1 KB",
    contents: "Mutual NDA between Circle Surrogacy and Duplo. Term: 24 months from signature.",
  },
  {
    id: "recovery-codes.txt",
    size: "0.3 KB",
    contents: "7F3K-2LQ9  M8PD-4XWA  R2VN-6TYC  H9JB-1ZSE",
  },
];

const toEntity = (f: WorkspaceFile): Entity => ({
  id: f.id,
  label: f.id,
  hint: f.size,
  icon: "FileText",
});

export const fileEntity: EntityType = {
  name: "file",
  async search(query, _ctx, opts) {
    const q = query.trim().toLowerCase();
    const found = FILES.filter((f) => f.id.includes(q)).map(toEntity);
    return opts?.limit ? found.slice(0, opts.limit) : found;
  },
  async get(id) {
    const f = FILES.find((x) => x.id === id);
    return f ? toEntity(f) : null;
  },
};

/** A file as a value you can hand to a command. */
export const fileSubject = (id: string): Piped => ({
  type: { kind: "entity", entity: { type: "file" } },
  value: id,
  label: id,
});

export const readFile: CommandNode = {
  id: "files.read",
  title: "Load as text",
  subtitle: "file → text",
  summary:
    "Read a workspace file and hand its contents on as text, ready to pipe into Encrypt or Send email. Reads only.",
  category: "Files",
  icon: "FileInput",
  weight: 30,
  effect: "pure",
  args: [
    {
      id: "file",
      label: "file",
      kind: "entity",
      required: true,
      placeholder: "which file…",
      entity: { type: "file" },
    },
  ],
  output: { kind: "text", label: "file contents" },
  run: async (a) => {
    const f = FILES.find((x) => x.id === a.file);
    const contents = f?.contents ?? "";
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
  subtitle: "workspace · pipe a file into a command",
  summary:
    "Files in the workspace. Each one is a subject: pick it, then pipe it into any command that takes a file (Load as text, Send email as an attachment).",
  icon: "FolderOpen",
  weight: 46,
  enumerate: "free",
  resolve: async () => [
    ...FILES.map(
      (f): CommandNode => ({
        id: `files.entity.${f.id}`,
        title: f.id,
        subtitle: f.size,
        icon: "FileText",
        keywords: ["file"],
        // the files are what you came to this folder for; the reader comes after them
        weight: 40,
        subject: fileSubject(f.id),
      }),
    ),
    readFile,
  ],
};
