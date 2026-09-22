import type { CommandResult } from "@command-kernel/core";
import type { HttpRoute } from "./define.js";
import type { Outcome } from "./outcome.js";
import { RESULT_KIND_HEADER, serverStatus, type WireError } from "./protocol.js";

/** How the server turns an outcome or a refusal into what goes back on each transport. */

const PROBLEM = "application/problem+json; charset=utf-8";

/** An RFC 7807 problem response for a WireError. */
export function problem(error: WireError, headers: Record<string, string> = {}): Response {
  const body = { type: `urn:command-kernel:error:${error.code}`, title: error.message, ...error };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: { "content-type": PROBLEM, ...headers },
  });
}

/** A problem response for a built-in code. */
export const refuse = (code: string, message: string, headers?: Record<string, string>) =>
  problem({ code, message, status: serverStatus(code) }, headers);

/** A failed outcome for a built-in code (either transport). */
export const refusal = (code: string, message: string): Outcome => ({
  ok: false,
  error: { code, message, status: serverStatus(code) },
});

/** A data result's payload, identical on both transports (absent -> null). */
export const dataOf = (r: CommandResult) => (r.kind === "data" ? (r.payload ?? null) : r.payload);

/** What either transport answers when a result cannot be written as JSON (a BigInt, a cycle). */
export const UNSENDABLE = {
  code: "serverFail",
  message: "Something went wrong sending this command's result",
  status: serverStatus("serverFail"),
};

/** `v` as JSON text, or null when JSON cannot hold it. */
export function jsonText(v: unknown): string | null {
  try {
    return JSON.stringify(v) ?? "null";
  } catch {
    return null;
  }
}

/** An outcome as an HTTP response. */
export function reply(outcome: Outcome, route?: HttpRoute): Response {
  if (!outcome.ok) return problem(outcome.error);
  const r = outcome.result;
  // a data result's body IS the payload; any other kind is the whole result, and the
  // header says which, so a client never confuses a payload with a result envelope
  const body = jsonText(
    r.kind === "data" ? dataOf(r) : { kind: r.kind, message: r.message, payload: r.payload },
  );
  if (body === null) return problem(UNSENDABLE);
  const cache = route?.cache === "immutable" ? "private, max-age=31536000, immutable" : "no-store";
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      [RESULT_KIND_HEADER]: r.kind,
    },
  });
}

/** True for `application/json`, with or without parameters (`; charset=utf-8`). */
export function isJsonType(contentType: string | null): boolean {
  return contentType?.split(";")[0]?.trim().toLowerCase() === "application/json";
}
