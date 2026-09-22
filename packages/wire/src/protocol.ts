import type { ArgError, ArgValues, GateCheck, Grant } from "@command-kernel/core";

/**
 * The wire protocol -- one command system, two transports.
 *
 * Every command a kernel holds can be called over HTTP or over a WebSocket, and
 * both reach the SAME `kernel.command(...)` with the SAME gate. The transports
 * differ only in framing:
 *
 *   HTTP       POST {base}/{command}         body = args JSON  -> 200 data | problem+json
 *              GET  {declared route}         path + query = args -> 200 data (cacheable)
 *   WebSocket  -> {"t":"cmd","id":"c1","name":"x.y","args":{...}}
 *              <- {"t":"ok","id":"c1","kind":"data","message":"...","data":...}
 *              <- {"t":"err","id":"c1","error":{...WireError}}
 *              <- {"t":"evt","name":"box.changed","data":...}        (server push)
 *
 * Responses on a socket may arrive out of order; a client matches them by `id`.
 */

/** Client -> server on a socket: call a command. */
export interface CallFrame {
  t: "cmd";
  /** client-chosen, unique per socket; echoed on the answer */
  id: string;
  name: string;
  args?: ArgValues;
  /** a grant the server minted earlier, for a confirm-gated command */
  evidence?: Grant;
}

/** Server -> client: the command ran. `data` is the result payload. */
export interface OkFrame {
  t: "ok";
  id: string;
  kind: string;
  message: string;
  data?: unknown;
}

/** Server -> client: the command did not run, and why. */
export interface ErrFrame {
  t: "err";
  /** null when the frame it answers could not even be read */
  id: string | null;
  error: WireError;
}

/** Server -> client: something happened that the client did not ask about. */
export interface EventFrame {
  t: "evt";
  name: string;
  data?: unknown;
}

export type ServerFrame = OkFrame | ErrFrame | EventFrame;

/**
 * Why a call failed, identical on both transports. Over HTTP it is the body of an
 * RFC 7807 `application/problem+json` response (plus `type` and `title`).
 */
export interface WireError {
  /** stable machine word; see ERROR_STATUS for the built-in ones */
  code: string;
  message: string;
  /** the HTTP status this error maps to (also carried on a socket, for uniformity) */
  status: number;
  details?: unknown;
  /** required args with no value (code "invalidArguments") */
  missing?: string[];
  /** present-but-invalid args (code "invalidArguments") */
  errors?: ArgError[];
  /** the gate's checks (codes "forbidden" and "confirmRequired") */
  checks?: GateCheck[];
}

/**
 * Built-in error codes and their HTTP status. A `CommandError` thrown by a `run()`
 * may use any code; an unlisted one maps through `statusFor` (server option) or,
 * failing that, to 400 -- a named refusal is the caller's problem, not a crash.
 */
export const ERROR_STATUS: Readonly<Record<string, number>> = {
  badRequest: 400, // the frame or body could not be read
  invalidArguments: 400, // missing or invalid args
  unauthorized: 401, // the host could not establish who is calling
  forbidden: 403, // the gate said no
  notFound: 404, // a record the command names does not exist
  unknownCommand: 404, // no such command
  methodNotAllowed: 405,
  confirmRequired: 409, // the gate wants a confirm (grant) first
  conflict: 409,
  stateMismatch: 409,
  tooLarge: 413,
  ambiguous: 422, // an entity arg matched several records
  rateLimited: 429,
  serverFail: 500, // anything unexpected; the message is never the raw exception
  unavailable: 503,
  // client-side only, never sent by a server (status 0: no HTTP answer was involved)
  timeout: 0,
  disconnected: 0,
  aborted: 0, // the caller cancelled
  badResponse: 0, // the answer was not ours (e.g. an auth proxy's HTML login page)
};

/** The built-in status for a code, else `fallback`. May be 0 for a client-only code. */
export function statusOf(code: string, fallback = 400): number {
  return ERROR_STATUS[code] ?? fallback;
}

/**
 * The HTTP status a SERVER answers with for a code: the built-in table, then the
 * host's `statusFor`, then 400; anything outside 400-599 (a client-only code thrown
 * by a run(), a host mapping of 600) becomes 500, because a Response cannot carry it.
 */
export function serverStatus(
  code: string,
  statusFor?: (code: string) => number | undefined,
): number {
  const s = ERROR_STATUS[code] ?? statusFor?.(code) ?? 400;
  return Number.isInteger(s) && s >= 400 && s <= 599 ? s : 500;
}

/** HTTP carries a grant (for a confirm-gated command) in this header as `nonce.sig`. */
export const EVIDENCE_HEADER = "command-evidence";
/** HTTP says what kind of result the body is: `data` (the body IS the payload) or another kind. */
export const RESULT_KIND_HEADER = "command-result-kind";

/** Encode any server frame for a socket. */
export function encodeFrame(frame: ServerFrame): string {
  return JSON.stringify(frame);
}
