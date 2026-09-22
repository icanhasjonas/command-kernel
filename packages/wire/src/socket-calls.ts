import { failure, fromProblem, type WireCallError } from "./client-error.js";
import type { Connection } from "./connection.js";
import type { ErrFrame, OkFrame } from "./protocol.js";

/**
 * The client's calls in flight on the socket, matched to their answers by `id`.
 * Every call settles exactly once, with its answer or a WireCallError (timeout,
 * abort, a send that failed, a dropped socket), and settling always clears its
 * timer and abort listener.
 */

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: WireCallError) => void;
  cleanup: () => void;
}

export function createSocketCalls(timeoutMs: number) {
  const pending = new Map<string, Pending>();

  const settle = (id: string) => {
    const p = pending.get(id);
    if (p) {
      pending.delete(id);
      p.cleanup();
    }
    return p;
  };

  return {
    /** Send `frameText` (call `id`) over `conn` and wait for its answer. */
    call(
      conn: Connection | null,
      frameText: string,
      id: string,
      name: string,
      signal?: AbortSignal,
    ) {
      return new Promise<unknown>((resolve, reject) => {
        if (signal?.aborted) return reject(failure("aborted", `${name} was cancelled`));
        const onAbort = () => settle(id)?.reject(failure("aborted", `${name} was cancelled`));
        const timer = setTimeout(() => {
          settle(id)?.reject(failure("timeout", `${name} did not answer within ${timeoutMs} ms`));
          // a socket that swallowed a call may be half-open: make it prove it is alive
          conn?.probe();
        }, timeoutMs);
        signal?.addEventListener("abort", onAbort, { once: true });
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };
        pending.set(id, { resolve, reject, cleanup });
        let sent: boolean;
        try {
          sent = conn?.send(frameText) ?? false;
        } catch {
          // a socket that throws on send (closing, in some runtimes) never took the frame
          sent = false;
        }
        if (!sent) settle(id)?.reject(failure("disconnected", "The socket is not open"));
      });
    },

    /** An answer from the server; one for a call we no longer wait on is ignored. */
    answer(frame: OkFrame | ErrFrame) {
      const p = frame.id ? settle(frame.id) : undefined;
      if (!p) return;
      if (frame.t === "err") {
        // an err frame that is not ours in shape still settles its call, never hangs it
        const e: unknown = frame.error;
        if (typeof e !== "object" || e === null)
          return p.reject(failure("badResponse", "An error frame came back with no error in it"));
        const { status } = e as { status?: unknown }; // read field by field by fromProblem
        return p.reject(fromProblem(e, typeof status === "number" ? status : 0));
      }
      p.resolve(
        frame.kind === "data"
          ? (frame.data ?? null)
          : { kind: frame.kind, message: frame.message, payload: frame.data },
      );
    },

    /** The socket dropped: every call in flight may or may not have run, so say so. */
    dropAll() {
      for (const id of [...pending.keys()]) {
        settle(id)?.reject(failure("disconnected", "The connection dropped before an answer came"));
      }
    },
  };
}
