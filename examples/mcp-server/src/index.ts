/**
 * THE BRIDGE — an MCP stdio server whose entire tool surface is the kernel's
 * agent projection. This is the README's claim made runnable: "a bridge like MCP
 * is ~50 lines of protocol on top" of `createProjection`.
 *
 * The projection already emits MCP-shaped tools (`{ name, description,
 * inputSchema }`) and dispatches a call to the ONE kernel + gate. So the bridge
 * is pure protocol plumbing: forward `tools/list` from `projection.tools`, and
 * forward `tools/call` into `projection.call`. No command logic, no second gate.
 *
 * We use the low-level `Server` (not `McpServer`) on purpose: `McpServer.registerTool`
 * wants Zod shapes, which would force us to REBUILD every schema the projection
 * already emits as JSON Schema — the opposite of "50 lines on top". `Server` takes
 * the projection's `inputSchema` verbatim, which is the honest, minimal bridge.
 *
 * THE TRUST LINE survives the hop: `issues.close` is gated (`confirm: true`), so a
 * `tools/call` on it comes back `{ kind: "gate" }` and NEVER executes — the model
 * cannot self-approve. Run it: `bun src/index.ts` (talks MCP over stdin/stdout).
 */
import { createProjection } from "@command-kernel/agent";
import { type Ctx, createKernel } from "@command-kernel/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { roots } from "./commands";

// The kernel + its agent projection. A real bridge would derive `ctx` per MCP
// session (the operator's identity); here it is a fixed operator.
const kernel = createKernel({ roots });
const projection = createProjection(kernel);
const ctx: Ctx = {
  location: { module: "mcp" },
  user: { id: "op", name: "operator", role: "admin", brand: "demo" },
  now: Date.now(),
  frecency: {},
};

// The bridge: two handlers, both pure forwarders.
export function createServer(): Server {
  const server = new Server(
    { name: "command-kernel-demo", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: projection.tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await projection.call(req.params.name, req.params.arguments ?? {}, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
  return server;
}

// Only spin up stdio when run as the entrypoint, so tests can import the server.
if (import.meta.main) {
  await createServer().connect(new StdioServerTransport());
}
