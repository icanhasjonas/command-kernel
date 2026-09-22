import type { ArgValues, Ctx, Grant } from "@command-kernel/core";
import { readGrant, readLimited } from "./body.js";
import type { HttpRoute } from "./define.js";
import type { Outcome } from "./outcome.js";
import { EVIDENCE_HEADER } from "./protocol.js";
import { isJsonType, refuse, reply } from "./reply.js";
import { queryArgs } from "./route.js";

/** What the HTTP transport needs from the server: its routes, limits and the two calls. */
export interface HttpDeps {
  base: string;
  maxBytes: number;
  commandIds: ReadonlySet<string>;
  routes: {
    match(
      pathname: string,
    ): { id: string; route: HttpRoute; params: Record<string, string> } | null;
  };
  call(name: string, args: ArgValues, ctx: Ctx, evidence?: Grant): Promise<Outcome>;
  confirmCall(name: string, args: ArgValues, ctx: Ctx): Promise<Outcome>;
}

const isBag = (v: unknown): v is ArgValues =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Every method this transport answers: the Allow header of OPTIONS and of a 405. */
const ALLOW = "GET, HEAD, POST, OPTIONS";

/** POST {base}/{command}: a JSON object of args, or `?confirm` to ask for a grant. */
async function postCall(
  d: HttpDeps,
  request: Request,
  url: URL,
  ctx: Ctx,
  evidence: Grant | undefined,
) {
  const rest = url.pathname.slice(d.base.length) || "/";
  let name: string;
  try {
    name = decodeURIComponent(rest.slice(1));
  } catch {
    return refuse("badRequest", "Malformed command name");
  }
  if (!name || name.includes("/")) return refuse("unknownCommand", `No command at ${rest}`);
  // only JSON is a call: a CORS-simple text/plain or form POST from another origin is not
  if (!isJsonType(request.headers.get("content-type")))
    return refuse("unsupportedMediaType", "A call is a POST with content-type application/json");
  const body = await readLimited(request, d.maxBytes);
  if ("fail" in body)
    return body.fail === "tooLarge"
      ? refuse("tooLarge", `Body over ${d.maxBytes} bytes`)
      : refuse("badRequest", "The body could not be read");
  let args: unknown = {};
  if (body.text.trim()) {
    try {
      args = JSON.parse(body.text);
    } catch {
      return refuse("badRequest", "Body is not JSON");
    }
  }
  if (!isBag(args)) return refuse("badRequest", "Body must be a JSON object of args");
  if (url.searchParams.has("confirm")) return reply(await d.confirmCall(name, args, ctx));
  return reply(await d.call(name, args, ctx, evidence));
}

/** True when `rest` is a declared GET route or a command's POST path. */
function exists(d: HttpDeps, rest: string): boolean {
  if (d.routes.match(rest)) return true;
  try {
    return d.commandIds.has(decodeURIComponent(rest.slice(1)));
  } catch {
    return false; // a malformed escape names nothing
  }
}

async function answer(d: HttpDeps, request: Request, ctx: Ctx): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== d.base && !url.pathname.startsWith(`${d.base}/`)) return null;
  const rest = url.pathname.slice(d.base.length) || "/";
  if (request.method === "OPTIONS") {
    // the host owns CORS; this only answers what a path that EXISTS accepts. A
    // preflight carries no grant, so the evidence header is never read here.
    return exists(d, rest)
      ? new Response(null, { status: 204, headers: { allow: ALLOW } })
      : refuse("unknownCommand", `No command or route at ${rest}`);
  }
  const evidence = readGrant(request.headers.get(EVIDENCE_HEADER));
  if (evidence === "invalid")
    return refuse("badRequest", `${EVIDENCE_HEADER} must be nonce.expiresAt.sig or nonce.sig`);

  if (request.method === "GET" || request.method === "HEAD") {
    const hit = d.routes.match(rest);
    if (hit)
      return reply(
        await d.call(hit.id, { ...queryArgs(url.searchParams), ...hit.params }, ctx, evidence),
        hit.route,
      );
    const name = rest.slice(1);
    if (d.commandIds.has(name))
      return refuse("methodNotAllowed", `${name} is called with POST`, { allow: "POST" });
    return refuse("unknownCommand", `No GET route ${rest}`);
  }
  if (request.method !== "POST")
    return refuse("methodNotAllowed", "Use POST, or GET on a declared route", { allow: ALLOW });
  return postCall(d, request, url, ctx, evidence);
}

/** The HTTP transport. HEAD is GET without the body, on every branch: same status, same headers. */
export function httpHandler(d: HttpDeps) {
  return async (request: Request, ctx: Ctx): Promise<Response | null> => {
    const res = await answer(d, request, ctx);
    if (!res || request.method !== "HEAD") return res;
    return new Response(null, { status: res.status, headers: res.headers });
  };
}
