import type {
  ArgValue,
  ArgValues,
  CommandNode,
  CommandResponse,
  Ctx,
  Entity,
  Kernel,
  NodeDescriptor,
  PathSegment,
} from "@command-kernel/core";
import { parseDeeplink } from "@command-kernel/core";
import { type McpTool, toMcpTool } from "./tools.js";

/**
 * The PROJECTION - the kernel as a small, generic tool surface.
 *
 * Instead of one tool per command, expose four generic tools that let an agent
 * walk the SAME tree a human does, plus optional promoted named tools for the
 * high-traffic commands (the hybrid the research doc recommends - a purely
 * generic navigator tends to make a model worse at tool-calling than named
 * tools). This is model- and protocol-agnostic: an MCP server, a raw LLM loop,
 * or a test harness all consume it via `tools` + `call`.
 *
 *   search - rank/find commands at a level   -> completions
 *   resolve - list a node's children (drill)  -> completions
 *   execute - run the tip                     -> result | gate | needs-args
 *   discover - search a typed entity catalog   -> entities
 *
 * THE TRUST LINE: `execute` returns `gate` when human approval is owed. It never
 * mints a grant - the model cannot self-approve. A bridge surfaces the gate to
 * its human operator and re-issues approval out of band (never as a model tool).
 */

export type ProjectionResult =
  | { kind: "completions"; items: NodeDescriptor[] }
  /** `value`: what a node with an `output` hands on - pass it as an arg of the next tool */
  | { kind: "result"; message: string; payload?: unknown; value?: ArgValue }
  | { kind: "gate"; reason?: string; checks: Array<{ label: string; ok: boolean }> }
  | { kind: "needs-args"; missing: string[]; errors: Array<{ argId: string; message: string }> }
  | { kind: "disambiguate"; arg: string; query: string; candidates: Entity[] }
  | { kind: "entities"; entities: Entity[] }
  | { kind: "error"; message: string };

export interface ProjectionOptions {
  /**
   * Top-level commands to ALSO expose as first-class named tools (reliability for
   * hot/high-stakes commands). Executed flat (path = [id]); reach nested commands
   * via the generic `execute` with a slash path.
   */
  promote?: CommandNode[];
}

export interface Projection {
  /** the tool definitions to advertise (4 generic + any promoted) */
  tools: McpTool[];
  /** dispatch a tool call by name to the kernel; returns a JSON-serializable result */
  call(name: string, args: Record<string, unknown>, ctx: Ctx): Promise<ProjectionResult>;
}

const GENERIC_TOOLS: McpTool[] = [
  {
    name: "search",
    description:
      "Search/rank commands in the command tree. Returns self-describing items (id, summary, whether it navigates or executes, its args, its gate). Start here.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", description: "fuzzy text to rank commands by" },
        path: {
          type: "string",
          description: 'optional slash-joined command-id path to search within, e.g. "users"',
        },
      },
    },
  },
  {
    name: "resolve",
    description: "List the children of a command node (drill into a category / enumerate).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", description: "slash-joined command-id path to enumerate" },
      },
    },
  },
  {
    name: "execute",
    description:
      "Run a command. Returns its result, OR a gate (a human must approve - you cannot self-approve), OR needs-args (missing/invalid arguments).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description: 'slash-joined command-id path to run, e.g. "users/users.send_reset"',
        },
        args: {
          type: "object",
          description: "argument values keyed by arg id",
          additionalProperties: true,
        },
      },
    },
  },
  {
    name: "discover",
    description:
      "Search a typed entity catalog (people, submissions, ...) to resolve a natural-language reference into an id you can pass as an arg.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["entityType", "query"],
      properties: {
        entityType: { type: "string", description: 'the entity type name, e.g. "person"' },
        query: { type: "string", description: "text to search the catalog" },
        constraint: {
          type: "string",
          description: 'optional refinement, e.g. "with-email-address"',
        },
      },
    },
  },
];

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * A model-supplied args object as the kernel's ArgValues: the JSON values exactly as
 * the model sent them (a null means "not given"). The kernel does the rest by each
 * arg's declared kind: a number sent for a text arg becomes its text, text sent for a
 * typed arg is parsed, and anything that still does not fit is refused by validation,
 * so the model hears what was wrong instead of a value being silently reshaped.
 */
function toArgValues(v: unknown): ArgValues {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: ArgValues = {};
  for (const [k, val] of Object.entries(v as Record<string, ArgValue | null | undefined>)) {
    if (val !== undefined && val !== null) out[k] = val; // parsed JSON: already JSON-shaped
  }
  return out;
}

/** MCP tool names should be word-ish; map a dotted id to a safe name. */
function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function descriptorsFrom(res: CommandResponse): NodeDescriptor[] {
  if (res.kind !== "completions") return [];
  return res.items.flatMap((i) => (i.kind === "command" ? [i.descriptor] : []));
}

export function createProjection(kernel: Kernel, opts: ProjectionOptions = {}): Projection {
  const promoted = new Map<string, CommandNode>();
  const promotedTools: McpTool[] = [];
  for (const node of opts.promote ?? []) {
    const name = safeName(node.id);
    promoted.set(name, node);
    promotedTools.push({ ...toMcpTool(node), name });
  }

  async function run(path: PathSegment[], ctx: Ctx): Promise<ProjectionResult> {
    const res = await kernel.command({ path, execute: true }, ctx);
    if (res.kind === "result") {
      const { message, payload, value } = res.result;
      return { kind: "result", message, payload, ...(value !== undefined && { value }) };
    }
    if (res.kind === "gate")
      return {
        kind: "gate",
        ...(res.node.gate?.reason !== undefined && { reason: res.node.gate.reason }),
        checks: res.verdict.checks,
      };
    if (res.kind === "args")
      return { kind: "needs-args", missing: res.missing, errors: res.errors };
    if (res.kind === "disambiguate")
      return {
        kind: "disambiguate",
        arg: res.arg.id,
        query: res.query,
        candidates: res.candidates,
      };
    return { kind: "error", message: "command did not execute" };
  }

  return {
    tools: [...GENERIC_TOOLS, ...promotedTools],

    async call(name, args, ctx) {
      try {
        if (name === "search") {
          const res = await kernel.command(
            { path: parseDeeplink(str(args.path)), query: str(args.query) },
            ctx,
          );
          return { kind: "completions", items: descriptorsFrom(res) };
        }
        if (name === "resolve") {
          const res = await kernel.command({ path: parseDeeplink(str(args.path)), query: "" }, ctx);
          return { kind: "completions", items: descriptorsFrom(res) };
        }
        if (name === "execute") {
          const segs = parseDeeplink(str(args.path));
          const tip = segs[segs.length - 1];
          if (tip) tip.args = { ...tip.args, ...toArgValues(args.args) };
          return run(segs, ctx);
        }
        if (name === "discover") {
          if (!kernel.entities) return { kind: "entities", entities: [] };
          const entities = await kernel.entities.search(
            str(args.entityType),
            str(args.query),
            ctx,
            args.constraint ? { constraint: str(args.constraint) } : undefined,
          );
          return { kind: "entities", entities };
        }
        const node = promoted.get(name);
        if (node) return run([{ id: node.id, args: toArgValues(args.args ?? args) }], ctx);
        return { kind: "error", message: `unknown tool: ${name}` };
      } catch (e) {
        return { kind: "error", message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
