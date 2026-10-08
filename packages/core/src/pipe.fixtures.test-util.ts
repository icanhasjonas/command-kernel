import type { Piped } from "./args.js";
import type { EntityType } from "./entity.js";
import type { CommandNode, Ctx } from "./types.js";

/** A small world to pipe through: files, people, read, encrypt, send. */

export const ctx: Ctx = {
  location: { module: "home" },
  user: { id: "u1", name: "T", role: "admin", brand: "circle" },
  now: 0,
  frecency: {},
};

const FILES: Record<string, string> = { "notes.md": "hello", "plan.txt": "ship it" };

export const fileEntity: EntityType = {
  name: "file",
  search: async (q) =>
    Object.keys(FILES)
      .filter((f) => f.includes(q))
      .map((id) => ({ id, label: id })),
  get: async (id) => (id in FILES ? { id, label: id } : null),
};

export const personEntity: EntityType = {
  name: "person",
  search: async () => [{ id: "ada@x.io", label: "Ada" }],
  get: async (id) => (id.includes("@") ? { id, label: id } : null),
};

export const aFile = (id: string): Piped => ({
  type: { kind: "entity", entity: { type: "file" } },
  value: id,
  label: id,
});

export const aPerson = (id: string): Piped => ({
  type: { kind: "entity", entity: { type: "person" } },
  value: id,
});

/** what each run() saw, by node id */
export const seen: Record<string, unknown> = {};

export const readFile: CommandNode = {
  id: "files.read",
  title: "Load as text",
  args: [{ id: "file", label: "file", kind: "entity", required: true, entity: { type: "file" } }],
  output: { kind: "text", label: "file contents" },
  run: async (a) => {
    seen["files.read"] = a;
    return { kind: "data", message: "read", value: FILES[String(a.file)] ?? "" };
  },
};

export const encrypt: CommandNode = {
  id: "crypto.encrypt",
  title: "Encrypt",
  args: [
    { id: "text", label: "text", kind: "text", required: true },
    { id: "to", label: "for", kind: "entity", required: true, entity: { type: "person" } },
  ],
  output: { kind: "text", label: "ciphertext" },
  run: async (a) => {
    seen["crypto.encrypt"] = a;
    return { kind: "data", message: "sealed", value: `enc(${a.text})` };
  },
};

export const sendEmail: CommandNode = {
  id: "email.send",
  title: "Send email",
  gate: { confirm: true },
  args: [
    { id: "to", label: "to", kind: "entity", required: true, entity: { type: "person" } },
    { id: "subject", label: "subject", kind: "string", required: true },
    { id: "body", label: "body", kind: "text" },
    {
      id: "attachments",
      label: "attachments",
      kind: "entity",
      multiple: true,
      entity: { type: "file" },
    },
  ],
  input: "body",
  run: async (a) => {
    seen["email.send"] = a;
    return { kind: "toast", message: "sent" };
  },
};

/** a free category the router walks into, and a query branch it must not */
export const tools: CommandNode = {
  id: "tools",
  title: "Tools",
  resolve: async () => [readFile, encrypt],
};

export const search: CommandNode = {
  id: "search",
  title: "Search",
  args: [{ id: "q", label: "q", kind: "string", positional: true }],
  resolve: async () => [{ ...sendEmail, id: "search.send" }],
};

export const ROOTS: CommandNode[] = [tools, search, sendEmail];
