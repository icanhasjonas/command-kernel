/**
 * CommandError -- how a `run()` says WHY it could not do the thing, in a form a
 * driver can act on without parsing prose.
 *
 * `code` is a stable machine word ("notFound", "forbidden", "conflict", ...); the
 * message is for a human; `details` is structured context. A UI driver shows the
 * message, the wire driver maps the code to an HTTP status and a WebSocket error
 * frame, an agent branches on the code. Anything else a `run()` throws is an
 * unexpected failure, and drivers treat it as one.
 */
export class CommandError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.details = details;
  }
}

/** True for a CommandError, including one from another copy of this package. */
export function isCommandError(err: unknown): err is CommandError {
  return (
    err instanceof CommandError ||
    (err instanceof Error &&
      err.name === "CommandError" &&
      // a vendored second copy of this class fails `instanceof`; read `code` structurally
      typeof (err as { code?: unknown }).code === "string")
  );
}
