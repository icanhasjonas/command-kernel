# @command-kernel/wire

Driver #6, headless. Every command in a kernel, callable over **HTTP** and over a
**WebSocket**, through the same `kernel.command(...)` and the same gate. One declaration per
command is shared by server and client, types the call end to end, and generates the
reference docs.

```bash
bun add @command-kernel/core @command-kernel/wire
```

## Why

An app has small, frequent calls (mark read, flag, list what changed) that want a live
socket, and heavy or cacheable reads (a message body, a file) that want plain HTTP. Both
should reach the same command with the same arg schema, the same gate, and the same error
names, and a caller should not care which one carried it.

## Declare once, implement on the server, call from anywhere

```ts
// shared: imported by server and client (no run() in here)
export const setSeen = defineCommand<{ threadId: string; seen: boolean }, { seq: number }>()(
  {
    id: "thread.setSeen",
    title: "Mark a thread seen",
    args: [
      { id: "threadId", label: "thread", kind: "string", required: true },
      { id: "seen", label: "seen", kind: "boolean", required: true },
    ],
  },
  { errors: ["notFound"], returns: "the box's new change sequence" },
);

export const getMessage = defineCommand<{ messageId: string }, Message>()(
  { id: "message.get", title: "Get a message", args: [/* ... */] },
  { http: { method: "GET", path: "/messages/:messageId", cache: "immutable" } },
);

export const boxChanged = defineEvent<{ boxId: string; seq: number }>("box.changed", "A box changed");
```

```ts
// server
const kernel = createKernel({
  gate: myGate, // (node, ctx, args) => verdict: the gate sees the args
  roots: [
    implement(setSeen, async ({ threadId, seen }, ctx: MyCtx) => ({ seq: await mark(threadId, seen) })),
    implement(getMessage, async ({ messageId }) => load(messageId)),
  ],
});
const wire = createWireServer({ kernel, specs: [setSeen, getMessage], base: "/api" });

// in your fetch handler (you establish who is calling and build the ctx)
const res = await wire.handleHttp(request, ctx); // null when the path is not under /api
// in your socket handler
socket.send(await wire.handleFrame(message, ctx));
// push to every socket that should see it
socket.send(wire.event(boxChanged.name, { boxId, seq }));
```

```ts
// client (browser, native via a custom socket factory, or a script)
const client = createWireClient({ http: "/api", ws: "wss://app.example/ws" });
client.connect();
const { seq } = await client.call(setSeen, { threadId: "t1", seen: true }); // socket if open, else HTTP
const msg = await client.call(getMessage, { messageId: "m1" }); // always HTTP: GET route, cacheable
client.on(boxChanged, ({ boxId, seq }) => refresh(boxId, seq));
client.onStatus((s) => showConnection(s)); // idle | connecting | open | reconnecting | closed
```

## The protocol

| | HTTP | WebSocket |
|---|---|---|
| Call | `POST {base}/{command}`, body = args JSON; or `GET` on a declared route (path + query = args) | `{"t":"cmd","id":"c1","name":"...","args":{...}}` |
| Success | `200`, body = the result's `payload` | `{"t":"ok","id":"c1","kind":"data","message":"...","data":...}` |
| Failure | RFC 7807 `application/problem+json`, `type: urn:command-kernel:error:<code>` | `{"t":"err","id":"c1","error":{code,message,status,...}}` |
| Push | - | `{"t":"evt","name":"...","data":...}` |

Errors carry the same `WireError` on both transports: `code`, `message`, `status`, and where
relevant `missing` / `errors` (args) or `checks` (the gate). Built-in codes and statuses are
in `ERROR_STATUS`; a `run()` throws `CommandError(code, message, details)` for its own. An
unexpected exception is a `serverFail` whose message never includes the exception.

Socket responses may arrive out of order and are matched by `id`. A call in flight when the
socket drops rejects with `disconnected` (`retryable: true`; it may or may not have run, so
make mutations idempotent). The client reconnects with full-jitter exponential backoff and
sends a heartbeat: a `ping` every 25 s, and the socket is replaced only when that ping
goes unanswered for 10 s, so a background tab whose timers the browser throttles is not
mistaken for a dead connection. A call that times out also probes the socket, so a
half-open connection is found in seconds rather than at the next interval.

`handleFrame` answers `ping` with `pong`, so any host works out of the box. A Durable
Object can answer it without waking at all:

```ts
ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
```

Every `POST` must carry `content-type: application/json` (parameters such as `charset` are
fine), body or not; anything else is `415 unsupportedMediaType`. That keeps a cross-origin
`text/plain` or form POST, which a browser sends without a preflight, from ever running a
command. The client always sends a JSON body (`{}` when there are no args).

`OPTIONS` on a command path answers `204` with `Allow`; CORS headers stay the host's job.
`HEAD` behaves as `GET` on a declared route, and never carries a body on any answer.
`client.onStatus(fn)` calls `fn` with the current status at once, then on every change.

## Limits

`specs` is the allowlist: the wire exposes the declared commands and nothing else, on both
transports. Any other node in the kernel answers exactly as a command that does not exist
(`404 unknownCommand`). Only ROOT commands are reachable; a child a node resolves is not.
To expose a child, declare a root command for it.

## Confirm-gated commands

A command with `gate: { confirm: true }` answers `confirmRequired` until a grant proves a
person approved it. Over the wire the SERVER mints that grant, never the client:

```ts
createWireServer({
  kernel,
  // where you check a person is really there: a step-up, a fresh sign-in, an operator
  confirm: async ({ name, args, ctx }) => isHuman(ctx) && (await askOperator(name, args)),
});
```

```ts
const grant = await client.confirm(deleteBox, { boxId });   // asks; the server decides
await client.call(deleteBox, { boxId }, { evidence: grant }); // now it runs
```

Without a `confirm` policy the wire carries grants but cannot mint them, and a
confirm-gated command is unreachable from a remote client. That is the safe default: a
client that could approve itself is not a gate.

Confirming never runs anything: the server checks the gate in a dry run, and a command
that owes no confirm answers `409 conflict`. A grant is bound to the caller who confirmed
(the kernel's `principalOf`, by default `ctx.user.id`); another caller presenting it gets
`confirmRequired`. The `confirmRequired` answer names the command (`details: { command,
title }`) and never echoes the args, which after `prefill` can hold server-side values.

## The server owns no sockets and no auth

`handleHttp(request, ctx)` and `handleFrame(message, ctx)` take the context the host built.
Authenticate once (per request, or on the socket upgrade), put the caller in `ctx`, and let
the gate decide per command and per arg.

## Reference docs

```ts
renderCommandDocs("My API", specs, events); // deterministic Markdown: every command, arg, route, error, event
commandManifest(specs, events);             // the same as JSON, for codegen (e.g. a Swift client)
```

Check the generated file into your repo and fail a test when it is stale; the reference then
cannot drift from the code.
