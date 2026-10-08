import type { ArgSpec, CommandNode, PathSegment, ValueType } from "@command-kernel/core";

/**
 * The node as its author wrote it, reconstructed from the live object (not a pasted
 * snippet), so what this panel shows is what the kernel is actually running.
 */
export function authored(node: CommandNode): string {
  const lines = [`{`, `  id: "${node.id}",`, `  title: "${node.title}",`];
  if (node.args?.length) {
    lines.push("  args: [");
    for (const a of node.args) lines.push(`    ${arg(a)},`);
    lines.push("  ],");
  }
  if (node.input) lines.push(`  input: "${node.input}",`);
  if (node.output) lines.push(`  output: ${valueType(node.output)},`);
  if (node.gate) lines.push(`  gate: ${JSON.stringify(node.gate).replace(/"(\w+)":/g, "$1: ")},`);
  if (node.effect) lines.push(`  effect: "${node.effect}",`);
  lines.push("  run: async (args) => …,", "}");
  return lines.join("\n");
}

function arg(a: ArgSpec): string {
  const parts = [`id: "${a.id}"`, `kind: "${a.kind}"`];
  if (a.entity) parts.push(`entity: { type: "${a.entity.type}" }`);
  if (a.required) parts.push("required: true");
  if (a.multiple) parts.push("multiple: true");
  if (a.enumValues) parts.push(`enumValues: [${a.enumValues.length} options]`);
  return `{ ${parts.join(", ")} }`;
}

function valueType(t: ValueType): string {
  return t.entity
    ? `{ kind: "entity", entity: { type: "${t.entity.type}" } }`
    : `{ kind: "${t.kind}" }`;
}

/** A plausible filled-in path for each showcased command, for its deeplink. */
export const SAMPLE_ARGS: Record<string, PathSegment["args"]> = {
  "email.send": { to: "ada@analytical.engine", subject: "Next steps", body: "See you Thursday" },
  "users.send_reset": { user: "jon@wall.north" },
  "files.read": { file: "launch-notes.md" },
  "media.thumbnail": { media: "launch-teaser.mp4" },
  "crypto.encrypt": { text: "Launch is Thursday", to: "ada@analytical.engine" },
};
