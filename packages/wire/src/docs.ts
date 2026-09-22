import { type ArgSpec, type JsonSchemaObject, toJsonSchema } from "@command-kernel/core";
import type { EventSpec, HttpRoute } from "./define.js";

/**
 * The reference, generated from the declarations -- so it cannot drift from them.
 *
 * `commandManifest` is the machine form (for codegen, e.g. a Swift client);
 * `renderCommandDocs` is the Markdown a person reads. Both are deterministic
 * (sorted by id), so a host can check the generated file in and fail a test when
 * it is stale.
 */

/** What the docs read from a declaration (a WireSpec fits). */
export interface DocSpec {
  readonly node: {
    id: string;
    title: string;
    summary?: string;
    subtitle?: string;
    args?: ArgSpec[];
    gate?: { roles?: string[]; confirm?: boolean; reason?: string };
    effect?: "pure" | "writes";
  };
  readonly http?: HttpRoute;
  readonly errors?: readonly string[];
  readonly returns?: string;
}

export interface ManifestCommand {
  id: string;
  title: string;
  summary: string | null;
  effect: "pure" | "writes" | null;
  args: JsonSchemaObject;
  http: HttpRoute | null;
  returns: string | null;
  errors: string[];
  gate: { roles: string[]; confirm: boolean } | null;
}

export interface Manifest {
  commands: ManifestCommand[];
  events: Array<{ name: string; summary: string }>;
}

/** Plain code-unit order: the same on every machine, unlike localeCompare. */
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = <T extends { id: string }>(a: T, b: T) => order(a.id, b.id);

export function commandManifest(
  specs: ReadonlyArray<DocSpec>,
  events: ReadonlyArray<EventSpec<unknown>> = [],
): Manifest {
  return {
    commands: specs
      .map(({ node, http, errors, returns }) => ({
        id: node.id,
        title: node.title,
        summary: node.summary ?? node.subtitle ?? null,
        effect: node.effect ?? null,
        args: toJsonSchema({
          id: node.id,
          title: node.title,
          ...(node.args && { args: node.args }),
        }),
        http: http ?? null,
        returns: returns ?? null,
        errors: [...(errors ?? [])].sort(order),
        gate: node.gate
          ? { roles: node.gate.roles ?? [], confirm: Boolean(node.gate.confirm) }
          : null,
      }))
      .sort(byId),
    events: events
      .map((e) => ({ name: e.name, summary: e.summary }))
      .sort((a, b) => order(a.name, b.name)),
  };
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function argType(a: ArgSpec): string {
  const base =
    a.kind === "enum" && a.enumValues
      ? a.enumValues.map((o) => `\`${o.value}\``).join(" / ")
      : a.kind === "json" && a.schema
        ? `json (${a.schema.type})`
        : a.kind;
  return a.multiple ? `list of ${base}` : base;
}

function commandSection(c: ManifestCommand, spec: DocSpec): string[] {
  const lines = [`### \`${c.id}\``, "", `**${c.title}.**${c.summary ? ` ${c.summary}` : ""}`, ""];
  const how = c.http
    ? `\`GET ${c.http.path}\`${c.http.cache === "immutable" ? " (cacheable forever)" : ""}, or any transport`
    : `WebSocket or \`POST /<base>/${c.id}\``;
  lines.push(`- Call: ${how}`);
  lines.push(`- Effect: ${c.effect ?? "unspecified"}`);
  if (c.gate)
    lines.push(
      `- Gate: ${[...c.gate.roles, c.gate.confirm ? "confirm" : ""].filter(Boolean).join(", ") || "custom policy"}`,
    );
  lines.push(`- Returns: ${c.returns ?? "nothing described"}`);
  if (c.errors.length) lines.push(`- Errors: ${c.errors.map((e) => `\`${e}\``).join(", ")}`);
  const args = spec.node.args ?? [];
  if (args.length) {
    lines.push("", "| Arg | Type | Required | Meaning |", "|---|---|---|---|");
    for (const a of args) {
      lines.push(
        `| \`${a.id}\` | ${cell(argType(a))} | ${a.required ? "yes" : "no"} | ${cell(a.label)} |`,
      );
    }
  }
  lines.push("");
  return lines;
}

export function renderCommandDocs(
  title: string,
  specs: ReadonlyArray<DocSpec>,
  events: ReadonlyArray<EventSpec<unknown>> = [],
): string {
  const manifest = commandManifest(specs, events);
  const specOf = new Map(specs.map((s) => [s.node.id, s]));
  const out = [
    `# ${title}`,
    "",
    "Generated from the command declarations. Do not edit by hand; regenerate instead.",
    "",
    "| Command | What it does |",
    "|---|---|",
    ...manifest.commands.map(
      (c) => `| [\`${c.id}\`](#${c.id.replace(/\./g, "")}) | ${cell(c.title)} |`,
    ),
    "",
    "## Commands",
    "",
  ];
  for (const c of manifest.commands) {
    const spec = specOf.get(c.id);
    if (spec) out.push(...commandSection(c, spec));
  }
  if (manifest.events.length) {
    out.push("## Events (server push)", "", "| Event | When |", "|---|---|");
    for (const e of manifest.events) out.push(`| \`${e.name}\` | ${cell(e.summary)} |`);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
