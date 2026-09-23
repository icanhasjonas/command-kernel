import { refuse } from "./reply.js";

/**
 * WebSocket subprotocol negotiation, for the host's upgrade handler.
 *
 * A browser that OFFERS subprotocols (`new WebSocket(url, ["mail.v1"])`, which is
 * what the client's `protocols` option does) fails the connection unless the server
 * answers with one of them in `Sec-WebSocket-Protocol`. So the host must echo the one
 * it speaks, and refuse a client that offers only others (an old build, a stranger):
 *
 *   const sub = negotiateSubprotocol(request, "mail.v1");
 *   if (!sub.ok) return sub.response;
 *   return new Response(null, { status: 101, webSocket: client, headers: sub.headers });
 *
 * Nothing offered is fine (a native client, a script): no header is echoed.
 */

export type SubprotocolAnswer =
  // what `new Headers()` takes, spelled out: the global `HeadersInit` type is DOM-only, and
  // bun-types does not declare it
  | { ok: true; headers?: Headers | Record<string, string> | [string, string][] }
  | { ok: false; response: Response };

export function negotiateSubprotocol(request: Request, name: string): SubprotocolAnswer {
  const offered = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (offered.length === 0) return { ok: true };
  // protocol names are case-sensitive tokens (RFC 6455 4.1): compared exactly
  if (offered.includes(name)) return { ok: true, headers: { "sec-websocket-protocol": name } };
  return {
    ok: false,
    response: refuse(
      "badRequest",
      `This socket speaks the ${name} subprotocol, which was not offered`,
    ),
  };
}
