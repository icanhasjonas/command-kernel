import type { ArgValues, Ctx, Grant } from "@command-kernel/core";
import { isBag } from "./bag.js";
import { readGrant, readLimited } from "./body.js";
import type { HttpRoute } from "./define.js";
import type { Outcome } from "./outcome.js";
import { EVIDENCE_HEADER, serverStatus, type WireError } from "./protocol.js";
import { isJsonType, problem, refuse, reply } from "./reply.js";
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
  /** the host's details for a refusal the wire made for `name` (a declared command only) */
  ownError(name: unknown, error: WireError): WireError;
}

/** Every method this transport answers: the Allow header of OPTIONS and of a 405. */
const ALLOW = "GET, HEAD, POST, OPTIONS";

/** A refusal of a call to `name`, with the host's details for it. */
const deny = (
  d: HttpDeps,
  name: unknown,
  code: string,
  message: string,
  headers?: Record<string, string>,
) => problem(d.ownError(name, { code, message, status: serverStatus(code) }), headers);

/** The command a path names, as POST sees it (undefined for a malformed escape). */
function pathName(rest: string): string | undefined {
  try {
    return decodeURIComponent(rest.slice(1));
  } catch {
    return undefined;
  }
}

/** POST {base}/{command}: a JSON object of args, or `?confirm` to ask for a grant. */
async function postCall(
  d: HttpDeps,
  request: Request,
  url: URL,
  ctx: Ctx,
  evidence: Grant | undefined,
) {
  const rest = url.pathname.slice(d.base.length) || "/";
  const name = pathName(rest);
  if (name === undefined) return refuse("badRequest", "Malformed command name");
  if (!name || name.includes("/")) return refuse("unknownCommand", `No command at ${rest}`);
  // only JSON is a call: a CORS-simple text/plain or form POST from another origin is not
  if (!isJsonType(request.headers.get("content-type")))
    return deny(
      d,
      name,
      "unsupportedMediaType",
      "A call is a POST with content-type application/json",
    );
  const body = await readLimited(request, d.maxBytes);
  if ("fail" in body)
    return body.fail === "tooLarge"
      ? deny(d, name, "tooLarge", `Body over ${d.maxBytes} bytes`)
      : deny(d, name, "badRequest", "The body could not be read");
  let args: unknown = {};
  if (body.text.trim()) {
    try {
      args = JSON.parse(body.text);
    } catch {
      return deny(d, name, "badRequest", "Body is not JSON");
    }
  }
  if (!isBag(args)) return deny(d, name, "badRequest", "Body must be a JSON object of args");
  if (url.searchParams.has("confirm")) return reply(await d.confirmCall(name, args, ctx));
  return reply(await d.call(name, args, ctx, evidence));
}

/** True when `rest` is a declared GET route or a command's POST path. */
function exists(d: HttpDeps, rest: string): boolean {
  if (d.routes.match(rest)) return true;
  const name = pathName(rest); // a malformed escape names nothing
  return name !== undefined && d.commandIds.has(name);
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
  const read = request.method === "GET" || request.method === "HEAD";
  const hit = read ? d.routes.match(rest) : null;
  // the command this request is for: a GET route's, else the one its path names
  const target = hit ? hit.id : pathName(rest);
  const evidence = readGrant(request.headers.get(EVIDENCE_HEADER));
  if (evidence === "invalid")
    return deny(
      d,
      target,
      "badRequest",
      `${EVIDENCE_HEADER} must be nonce.expiresAt.sig or nonce.sig`,
    );

  if (read) {
    if (hit)
      return reply(
        await d.call(hit.id, { ...queryArgs(url.searchParams), ...hit.params }, ctx, evidence),
        hit.route,
      );
    const name = rest.slice(1);
    if (d.commandIds.has(name))
      return deny(d, name, "methodNotAllowed", `${name} is called with POST`, { allow: "POST" });
    return refuse("unknownCommand", `No GET route ${rest}`);
  }
  if (request.method !== "POST")
    return deny(d, target, "methodNotAllowed", "Use POST, or GET on a declared route", {
      allow: ALLOW,
    });
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
