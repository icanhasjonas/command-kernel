# @command-kernel/example-mcp-server

**The README's claim, proven.** Command Kernel says a bridge like MCP is
"~50 lines of protocol on top" of the kernel's agent projection. This example is
that bridge, runnable, with a test that keeps it honest in CI.

## What it proves

- `createProjection(kernel)` already emits MCP-shaped tools
  (`{ name, description, inputSchema }`) and dispatches a call to the ONE kernel +
  gate. So the bridge (`src/index.ts`) is pure protocol plumbing: forward
  `tools/list` from `projection.tools`, forward `tools/call` into
  `projection.call`. **~10 lines of actual glue**, no command logic, no second gate.
- **The trust line survives the MCP hop.** `issues.close` is gated
  (`gate: { confirm: true }`). A `tools/call` on it comes back `{ kind: "gate" }`
  and NEVER executes -- the model cannot self-approve. A human approves out of band.
- One kernel, many drivers: this MCP server and the React palette call the same
  verbs and the same gate.

## Files

- `src/commands.ts` -- a tiny mock "project console" tree (navigation, a search
  with a required arg, plain actions, and one gated destructive action).
- `src/index.ts` -- THE BRIDGE. An MCP stdio server over `createProjection`.
- `src/bridge.test.ts` -- spawns the server over real stdio with the SDK's own
  Client and asserts the three properties: tools advertised, pure command runs,
  gated command comes back gated.

We use the low-level `Server` (not `McpServer`) on purpose: `McpServer.registerTool`
wants Zod shapes, which would force rebuilding every schema the projection already
emits as JSON Schema. `Server` takes the projection's `inputSchema` verbatim --
the honest, minimal bridge.

## Run it

```bash
bun src/index.ts          # talks MCP over stdin/stdout (Ctrl-C to stop)
bun test src/bridge.test.ts   # the CI proof
```

## Attach to Claude Code

```bash
claude mcp add command-kernel-demo -- bun /ABSOLUTE/PATH/TO/examples/mcp-server/src/index.ts
```

Then ask Claude to `search` the command tree, `execute` a command, or try to
close an issue -- it will hit the gate and have to ask you to approve.

## Attach to the MCP Inspector

```bash
bunx @modelcontextprotocol/inspector bun /ABSOLUTE/PATH/TO/examples/mcp-server/src/index.ts
```

The inspector lists `search`, `resolve`, `execute`, `discover`; call `execute`
with `{ "path": "issues.close", "args": { "issueId": "ISS-14" } }` and watch it
return a gate instead of running.
