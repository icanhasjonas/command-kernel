import {
  type CommandNode,
  type Ctx,
  type JsonSchemaObject,
  outputNode,
  toJsonSchema,
} from "@command-kernel/core";

/**
 * MCP-shaped tool projection.
 *
 * The lingua franca for an LLM tool surface is MCP: a tool is
 * `{ name, description, inputSchema }` where `inputSchema` is a flat JSON Schema.
 * We derive exactly that from a `CommandNode` - `name` is the stable id, the
 * description is the agent-facing `summary`, and `inputSchema` is the SAME arg
 * schema the palette renders as chips. Hand these to any LLM / tool-calling SDK,
 * or wrap them in an MCP server; map the chosen tool's `name` back to a command
 * (it IS the node id) and run it through `kernel.command(...)` - same gate.
 *
 * A node that declares an `output` (it can feed a pipe) also gets an MCP
 * `outputSchema`: `{ value }`, typed by the same rules as its args, so a model
 * knows what it gets back and which tool's arg it can hand that `value` to.
 *
 * Projection is intentionally FLAT (no deep async walk of the tree): you pass the
 * node set you want to expose - e.g. `kernel.roots(ctx).filter((n) => n.run)`, or
 * a curated list. A "search" branch isn't enumerated; you expose the search
 * command itself as a tool that takes the query arg.
 */

export interface McpTool {
  /** stable, dot-namespaced - equals the CommandNode id */
  name: string;
  /** what the tool does, for the model to read */
  description: string;
  /** JSON Schema for the args (MCP `inputSchema`) */
  inputSchema: JsonSchemaObject;
  /** JSON Schema for the structured result, `{ value }` (MCP `outputSchema`) */
  outputSchema?: JsonSchemaObject;
}

/** Project a single node into an MCP tool definition. */
export function toMcpTool(node: CommandNode): McpTool {
  return {
    name: node.id,
    description: node.summary ?? node.subtitle ?? node.title,
    inputSchema: toJsonSchema(node),
    ...(node.output && { outputSchema: toJsonSchema(outputNode(node, node.output)) }),
  };
}

/**
 * Project a node list into MCP tools: the executable nodes (those with `run`),
 * filtered by `when(ctx)` when a context is given. Map a chosen tool's `name`
 * back to its node via the id to execute it through the kernel.
 */
export function collectTools(nodes: CommandNode[], ctx?: Ctx): McpTool[] {
  return nodes
    .filter((n) => n.run)
    .filter((n) => !n.when || !ctx || n.when(ctx))
    .map(toMcpTool);
}
