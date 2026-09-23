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
  // a GET route needs `effect: "pure"` said out loud: it is the author's promise it never writes
  { id: "message.get", title: "Get a message", effect: "pure", args: [/* messageId */] },
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
// "/api" resolves against the page; outside one, pass a full URL or your own `fetch`
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
unexpected exception, a result JSON cannot hold, or a `CommandError` whose `details` JSON
cannot hold (a `BigInt`, a cycle) is a `serverFail` that never includes the exception. So
is a `CommandError` with a client-only code (`timeout`, `disconnected`, `aborted`,
`badResponse`: status 0 in `ERROR_STATUS`), reported to `onError`: only the client itself
may say a call timed out, and `retryable` on those two codes needs status 0. A client set
up wrong is never `retryable`: a `headers()` that throws is `misconfigured`, and a relative
`http` base with no page to resolve it (and no `fetch` of your own) throws at creation. An arg
the command does not declare is `400 invalidArguments` naming it; a `multiple` arg sent as
`[]` is no value, so `run()` sees the same absent arg over a socket and a GET route.

Socket responses may arrive out of order and are matched by `id`. A call in flight when the
socket drops rejects with `disconnected` (`retryable: true`; it may or may not have run, so
make mutations idempotent). The client reconnects with full-jitter exponential backoff and
sends a heartbeat: a `ping` every 25 s, and the socket is replaced only when that ping goes
unanswered for 10 s, so a throttled background tab is not mistaken for a dead connection. A
call that times out also probes the socket. A socket still connecting after
`connectTimeoutMs` (10 s) is closed and retried, and the backoff starts over only once a
socket has stayed open for `stableMs` (10 s). A status listener or event handler that throws
is reported to `onError` (which may throw too) and stops nothing; a listener that re-enters
the client (calls `close()`) cannot reorder what the others see, and each listener's last
call is the current status. `client.onStatus(fn)` calls `fn` with the current status at once.

A server that closes with an application code (4000-4999: "signed out", "not a member") has
said something a reconnect cannot fix, so the client does not retry: the status goes to
`closed` and listeners get the code and reason as `change.closedBy` (also
`client.closedBy`). A later `connect()` starts over. `finalClose: (code) => boolean`
chooses which codes are final; `() => false` reconnects on everything.

Events pushed while the socket is down are lost. There is no resume or replay: a push goes
to the sockets open at that moment. So a client MUST resync when it comes back, and the
status listener says when: `change.reconnected` is `true` on an `open` that follows an
earlier open (after a drop, or a `close()` and `connect()`), and `false` on the first open,
even one that took several attempts.

```ts
client.onStatus((status, { reconnected, closedBy }) => {
  showConnection(status);
  if (closedBy) tellThePerson(closedBy.reason); // final: no reconnect follows
  if (reconnected) refetchEverythingShown(); // what changed while we were away is unknown
});
```

`handleFrame` answers `ping` with `pong`, so any host works out of the box. A Durable
Object can answer it without waking at all:

```ts
ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
```

Every `POST` must carry `content-type: application/json` (parameters such as `charset` are
fine), body or not; anything else is `415 unsupportedMediaType`. That keeps a cross-origin
`text/plain` or form POST, which a browser sends without a preflight, from ever running a
command. The client always sends a JSON body (`{}` when there are no args). A body over
`maxBytes` is `413 tooLarge`; one whose stream fails mid-read is `400 badRequest`.

A problem body's `title` is a fixed phrase per code ("Invalid arguments"; a `run()`'s own
code is its own title) and `detail` says what happened this time; `message` carries the
same text as `detail`. A problem is always `cache-control: no-store`, so a failed GET on an
`immutable` route is never kept.

`OPTIONS` answers `204` with `Allow` on a command's path or a declared route, and `404
unknownCommand` anywhere else; it never reads `command-evidence`. Every `405` carries
`Allow` too (CORS stays the host's job). `HEAD` is `GET` on a declared route, with no body
on any answer.

## Limits

`specs` is the allowlist: the wire exposes the declared commands and nothing else, on both
transports. Any other node in the kernel answers exactly as a command that does not exist
(`404 unknownCommand`). Only ROOT commands are reachable; a child a node resolves is not.
To expose a child, declare a root command for it.

`createWireServer` refuses at construction, naming the command: an id using anything but
letters, digits, `.`, `_` and `-`, or only dots (the URL parser folds `.` and `..` away); a
route param that is not a declared arg; and a GET route on a node that does not declare
`effect: "pure"` itself. A GET **fails closed**: it is cached, prefetched, and sent
cross-site by a link or an `<img>` with the user's cookies, so a node with no `effect` is
never assumed pure, gate or not. A write is always a POST.

A route param whose value is `""`, `.` or `..` is `400 invalidArguments` on every transport
(GET, POST and socket alike), and the client refuses it before sending: the URL parser
folds those segments away, so `/boxes/../messages/m1` would reach `/messages/m1`.

The host MUST check `Origin` on the WebSocket upgrade. A browser opens a cross-origin
socket without any preflight and sends the user's cookies with it, so a socket that trusts
its cookie alone can be driven by any page the user visits.

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

Without a `confirm` policy the wire carries grants but cannot mint them: a client that could
approve itself is not a gate. The policy sees the args the grant is signed over, after
`prefill` and coercion, never the raw ones the client sent.

Confirming never runs anything: args and the gate are checked in a dry run, bad args answer
`400 invalidArguments` as the call would, and a command that owes no confirm answers `409
conflict`. A grant is bound to the caller who confirmed (`principalOf`, by default
`ctx.user.id`); another caller presenting it gets `confirmRequired`. The `confirmRequired` answer names the command (`details: { command,
title }`) and never echoes the args, which after `prefill` can hold server-side values. A
confirm policy, gate or prefill that throws answers `serverFail`, never the exception.

A prefilled arg is the server's value: a call that sends one of the keys `prefill(ctx)` set
is `400 invalidArguments` naming it, on every transport and on confirm, whatever the value
(accepting an equal one would let a caller guess it one try at a time). The kernel itself
merges `{ ...prefill, ...args }`, which is right for a palette's editable default; the wire
is where a caller must not replace it. A prefill of `undefined` or `""` set nothing, and a
prefilled arg cannot be a GET route param (every such call would be refused).

A grant is an HMAC-SHA256 signature over the caller, the command, its args, a nonce and an
expiry, so it cannot be forged or reworked into another call. It **expires** 5 minutes
after it was minted on the kernel's clock (`createKernel({ now })`, default `Date.now`),
never on `ctx.now`, so a ctx built once on the socket upgrade is fine. The TTL is
`createHmacEvidenceStore(key, { ttlMs })`, which also refuses a grant expiring further
ahead. Over HTTP it travels in the `command-evidence` header as `nonce.expiresAt.sig`.

**Without a `spend` hook, a grant can be used again and again until it expires.** To make
each approval run exactly once, record spent nonces:

```ts
createWireServer({
  kernel,
  confirm,
  // your own atomic store: true the first time a nonce is claimed, false after;
  // keep each nonce until expiresAt, after which the grant is refused anyway
  spend: (nonce, expiresAt) => spentGrants.claimOnce(nonce, expiresAt),
});
```

A server with more than one isolate, or a Durable Object that hibernates, **must** give
every kernel the same key: `createKernel({ evidence: createHmacEvidenceStore(key) })` with
one 32-byte environment secret. The default key is per store, right for one process only.

## The server owns no sockets and no auth

`handleHttp(request, ctx)` and `handleFrame(message, ctx)` take the context the host built:
authenticate once (per request, or on the upgrade), put the caller in `ctx`, let the gate decide.

## Subprotocols

To version the socket, the client offers a subprotocol and the upgrade handler picks it:

```ts
// client: the default socket factory passes these to `new WebSocket(url, protocols)`
createWireClient({ http: "/api", ws: "wss://app.example/ws", protocols: ["mail.v1"] });

// server, in the upgrade handler
const sub = negotiateSubprotocol(request, "mail.v1");
if (!sub.ok) return sub.response; // 400 naming mail.v1: the client offered only others
return new Response(null, { status: 101, webSocket: client, headers: sub.headers });
```

A browser that offers protocols fails the connection when the server echoes none, so a
server must echo the one it speaks; `negotiateSubprotocol` does that. Offered nothing (a
native client, a script): ok, nothing to echo. Offered it among others: ok, and `headers`
echo it. Offered only others: a `400` problem to return instead of upgrading. A custom
`socket` factory ignores `protocols`; pass them to your own constructor.

## Reference docs

```ts
renderCommandDocs("My API", specs, events); // deterministic Markdown: every command, arg, route, error, event
renderCommandDocs("My API", specs, events, { base: "/api/v1" }); // paths as served: POST /api/v1/thread.list
commandManifest(specs, events);             // the same as JSON, for codegen (e.g. a Swift client)
```

Check the generated file in and fail a test when it is stale: the reference cannot drift.
