import { createMemoryEvidenceStore } from "./evidence.js";
import type { GatePolicy } from "./gate.js";
import { createMemoryPolicyStore } from "./policy.js";
import { rank } from "./rank.js";
import type { JsonSchemaNode } from "./schema.js";
import type { CommandNode, Ctx } from "./types.js";

/** Shared fixtures for the typed-args tests. */

export const ctx: Ctx = {
  location: { module: "test" },
  user: { id: "u1", name: "U", role: "admin", brand: "b" },
  now: 0,
  frecency: {},
};

export const cursors: JsonSchemaNode = {
  type: "object",
  properties: { box: { type: "string" }, seq: { type: "integer" } },
  required: ["box", "seq"],
  additionalProperties: false,
};

/** One arg of every typed kind, plus a text arg. */
export const setSeen: CommandNode = {
  id: "thread.setSeen",
  title: "Mark seen",
  args: [
    { id: "thread", label: "thread", kind: "string", required: true },
    { id: "seen", label: "seen", kind: "boolean", required: true },
    { id: "limit", label: "limit", kind: "number" },
    { id: "ids", label: "ids", kind: "number", multiple: true },
    { id: "cursor", label: "cursor", kind: "json", schema: cursors },
  ],
};

/** A confirm-gated command with a number, a boolean and a JSON list of text. */
export const trim: CommandNode = {
  id: "items.trim",
  title: "Trim items",
  gate: { confirm: true },
  args: [
    { id: "n", label: "n", kind: "number", required: true },
    { id: "hard", label: "hard", kind: "boolean" },
    {
      id: "order",
      label: "order",
      kind: "json",
      schema: { type: "array", items: { type: "string" } },
    },
  ],
  run: async () => ({ kind: "noop", message: "" }),
};

export const allow: GatePolicy = () => ({ allowed: true, needsConfirm: false, checks: [] });
export const confirm: GatePolicy = () => ({ allowed: true, needsConfirm: true, checks: [] });

export const deps = (gate: GatePolicy = allow) => ({
  gate,
  policy: createMemoryPolicyStore(),
  evidence: createMemoryEvidenceStore(),
  ranker: rank,
});
