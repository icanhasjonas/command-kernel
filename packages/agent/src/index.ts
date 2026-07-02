/**
 * @command-kernel/agent — driver #2, headless.
 *
 * The kernel projected as a tool surface for an LLM. Pure TS; depends only on
 * @command-kernel/core. The React chat UI that drives this in the demo is NOT
 * here — it lives in the example, because it is demo chrome. What lives here is
 * the reusable seam: turn a goal + a tool list into a chosen `command()` call.
 */

export { pickTool, type ToolPick } from "./adapter.js";
export {
  createProjection,
  type Projection,
  type ProjectionOptions,
  type ProjectionResult,
} from "./projection.js";
export { collectTools, type McpTool, toMcpTool } from "./tools.js";
