import type { WireError } from "./protocol.js";

/** Codes where the SAME call may simply be retried (it may or may not have run). */
const RETRYABLE = new Set(["unavailable", "rateLimited"]);
/**
 * Retryable only when the CLIENT saw them (status 0). A server never sends these; one
 * arriving with an HTTP status came from something else (an old or foreign server
 * passing on a run()'s own error) and says nothing about whether a retry would help.
 */
const RETRYABLE_CLIENT_SIDE = new Set(["timeout", "disconnected"]);

const retryable = (e: WireError) =>
  RETRYABLE.has(e.code) || (e.status === 0 && RETRYABLE_CLIENT_SIDE.has(e.code));

/** Every failure a client call can end in, from the server or from the client itself. */
export class WireCallError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly missing: string[];
  readonly errors: Array<{ argId: string; message: string }>;
  readonly checks: Array<{ label: string; ok: boolean }>;
  /** true when the same call may simply be retried; make such mutations idempotent */
  readonly retryable: boolean;

  constructor(error: WireError) {
    super(error.message);
    this.name = "WireCallError";
    this.code = error.code;
    this.status = error.status;
    this.details = error.details;
    this.missing = error.missing ?? [];
    this.errors = error.errors ?? [];
    this.checks = error.checks ?? [];
    this.retryable = retryable(error);
  }
}

/** A failure the client detected itself (no HTTP status involved). */
export const failure = (code: string, message: string) =>
  new WireCallError({ code, message, status: 0 });

/** Read a problem+json body into a WireCallError, whatever shape it arrived in. */
export function fromProblem(body: unknown, status: number): WireCallError {
  const p = (body ?? {}) as Partial<WireError>; // our server's problem body; every field is optional here
  return new WireCallError({
    code: typeof p.code === "string" ? p.code : "serverFail",
    message: typeof p.message === "string" ? p.message : `HTTP ${status}`,
    status,
    ...(p.details !== undefined && { details: p.details }),
    ...(Array.isArray(p.missing) && { missing: p.missing }),
    ...(Array.isArray(p.errors) && { errors: p.errors }),
    ...(Array.isArray(p.checks) && { checks: p.checks }),
  });
}
