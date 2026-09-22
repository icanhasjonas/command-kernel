import type { ArgValues, Grant } from "@command-kernel/core";
import { failure, fromProblem, WireCallError } from "./client-error.js";
import type { HttpRoute } from "./define.js";
import { EVIDENCE_HEADER, RESULT_KIND_HEADER } from "./protocol.js";
import { fillRoute } from "./route.js";

/**
 * The client's HTTP transport: POST {base}/{command}, or GET on a declared route.
 * Every failure comes back as a WireCallError with a code a caller can act on:
 * the server's own code, `timeout`, `aborted`, `unavailable` (no answer),
 * `badResponse` (an answer that is not ours), or `invalidArguments` (a route that
 * cannot be filled from the args -- a programming error, never retryable).
 */

/** The part of fetch this needs; any runtime's fetch (or a test double) fits. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  base: string;
  fetch: FetchLike;
  headers: (() => Record<string, string> | Promise<Record<string, string>>) | undefined;
  timeoutMs: number;
}

export interface CallExtras {
  signal?: AbortSignal | undefined;
  evidence?: Grant | undefined;
}

/** A non-data result, as both transports hand it to the caller. */
export interface ResultEnvelope {
  kind: string;
  message: string;
  payload?: unknown;
}

function target(o: HttpOptions, name: string, args: ArgValues, route?: HttpRoute): string {
  if (!route) return `${o.base}/${encodeURIComponent(name)}`;
  try {
    return `${o.base}${fillRoute(route.path, args)}`;
  } catch (e) {
    throw new WireCallError({
      code: "invalidArguments",
      message: e instanceof Error ? e.message : "Cannot build the route",
      status: 0,
    });
  }
}

export async function httpCall(
  o: HttpOptions,
  name: string,
  args: ArgValues,
  route: HttpRoute | undefined,
  extras: CallExtras,
): Promise<unknown> {
  const { signal, evidence } = extras;
  if (signal?.aborted) throw failure("aborted", `${name} was cancelled`);
  const url = target(o, name, args, route);
  const ctrl = new AbortController();
  const cancel = () => ctrl.abort();
  const timer = setTimeout(cancel, o.timeoutMs);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(evidence && { [EVIDENCE_HEADER]: `${evidence.nonce}.${evidence.sig}` }),
      ...(await o.headers?.()),
    };
    const res = route
      ? await o.fetch(url, { headers, signal: ctrl.signal })
      : await o.fetch(url, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(args),
          signal: ctrl.signal,
        });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // e.g. an auth proxy answering with its HTML login page: not ours, say so
      const type = res.headers.get("content-type") ?? "no content type";
      throw failure("badResponse", `${name}: expected JSON, got ${type} (HTTP ${res.status})`);
    }
    if (!res.ok) throw fromProblem(body, res.status);
    const kind = res.headers.get(RESULT_KIND_HEADER) ?? "data";
    return kind === "data" ? body : (body as ResultEnvelope); // a non-data body IS the result
  } catch (e) {
    if (e instanceof WireCallError) throw e;
    if (signal?.aborted) throw failure("aborted", `${name} was cancelled`);
    if (ctrl.signal.aborted)
      throw failure("timeout", `${name} did not answer within ${o.timeoutMs} ms`);
    throw failure("unavailable", e instanceof Error ? e.message : "Network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
