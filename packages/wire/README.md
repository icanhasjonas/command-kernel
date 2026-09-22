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
sends a heartbeat (`ping`, expecting `pong`) so a dead mobile connection is noticed.

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
