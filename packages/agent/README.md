# @command-kernel/agent

Driver #2 for [`@command-kernel/core`](../core), headless: project the command
kernel as an LLM **tool surface**. Pure TypeScript; depends only on core. The
React chat UI that drives this in the demo is NOT here — it is demo chrome and
lives in the example. What lives here is the reusable seam: turn a goal + a tool
list into a chosen `command()` call.

```bash
bun add @command-kernel/core @command-kernel/agent
```

## Usage

```ts
import { createKernel } from "@command-kernel/core";
import { pickTool } from "@command-kernel/agent";

const kernel = createKernel({ roots });
const tools = kernel.roots(ctx).filter((n) => n.run); // the executable leaves you expose

const pick = pickTool("reset the password for jon@wall.north", tools);
if (pick) {
  // the agent drives the SAME verb the human does — NO grant, so a gated tip
  // comes straight back as a gate for the operator to Allow.
  const res = await kernel.command(
    { path: [{ id: pick.node.id, args: pick.values }], execute: true, role: ctx.user.role },
    ctx,
    tools,
  );
  // res.kind === "gate" -> show the operator the exact command + args + reason
}
```

`pickTool(goal, tools)` is a deliberately dumb keyword+regex stand-in for a real
model tool-call. Swap it for an LLM call that returns `{ node, values }` — the
tool schemas come from each node's `title` + `summary` + `args`, and everything
downstream (the `command()` walk, the gate, the grant) is unchanged.

## The projection (recommended)

Don't emit one tool per command — emit a handful of generic tools and let the
agent walk the same tree a human does. `createProjection` is that surface, and
it's model- and protocol-agnostic (MCP, a raw LLM loop, a test all consume it):

```ts
import { createProjection } from "@command-kernel/agent";

const projection = createProjection(kernel, { promote: [sendEmail] }); // hybrid
projection.tools;        // -> [search, resolve, execute, discover, email_send]
await projection.call("search",   { query: "reset" }, ctx);            // -> completions
await projection.call("discover", { entityType: "person", query: "jon" }, ctx); // -> entities
await projection.call("execute",  { path: "users/users.send_reset", args: { user } }, ctx);
//   -> { kind: "result" } | { kind: "gate" } | { kind: "needs-args" }
```

Four generic tools cover the whole kernel:

| tool | does | returns |
|---|---|---|
| `search(query, path?)` | rank/find commands | `completions` |
| `resolve(path)` | drill / enumerate a node | `completions` |
| `execute(path, args)` | run the tip | `result` \| `gate` \| `needs-args` |
| `discover(entityType, query, constraint?)` | resolve an entity reference | `entities` |

`promote` adds first-class named tools for hot commands — the **hybrid** that
keeps tool-calling reliable (a purely generic navigator tends to make a model
worse). All off the one registry, all through the one gate.

**Trust line:** `execute` returns `gate` when human approval is owed; it never
mints a grant. The model cannot self-approve — a bridge surfaces the gate to its
operator and re-issues approval out of band. An **MCP server** is then a thin
shell: map `tools/list` → `projection.tools` and `tools/call` → `projection.call`.

## MCP-shaped tool definitions (lower level)

For a real model, project nodes into the standard MCP tool shape
(`{ name, description, inputSchema }`, JSON Schema params) and hand them to any
tool-calling SDK or wrap them in an MCP server:

```ts
import { collectTools, toMcpTool } from "@command-kernel/agent";

const tools = collectTools(kernel.roots(ctx), ctx); // executable nodes -> MCP tools
// hand `tools` to the model; it picks a tool name (= the node id) + args.
const out = await kernel.command({ path: [{ id: chosen.name, args }], execute: true }, ctx);
```

`inputSchema` is derived from the same `ArgSpec` as the palette chips (the
keystone). The projection is flat by design — expose a search command as a tool
rather than enumerating a backend.

## Why this matters

The agent can't fabricate approval. It re-issues the call with a grant ONLY after
its operator clicks Allow, and the grant is minted by `kernel.evidence` — bound to
the exact command + args. A forged grant fails to verify and bounces straight back
to the gate. Same kernel, same gate, no second code path. See the trust-core
explainer in [`../core/README.md`](../core/README.md#the-trust-core).

## License

MIT.
