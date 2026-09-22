import type { ArgSpec, ArgValues, CommandNode, Ctx } from "@command-kernel/core";

/**
 * Commands as a SHARED declaration plus a SERVER implementation.
 *
 * A wire command is declared once, in code both sides import (no `run` in it), and
 * implemented once, on the server. The declaration carries the kernel node (id,
 * title, summary, arg schema, gate) plus what only the wire needs: an optional
 * cacheable GET route, the error codes it may answer with, and a phantom type pair
 * so a client call is typed end to end:
 *
 *   export const setSeen = defineCommand<{ threadId: string; seen: boolean }, { seq: number }>()(
 *     { id: "thread.setSeen", title: "Mark a thread seen", args: [...] },
 *     { errors: ["notFound"] },
 *   );
 *   // server
 *   implement(setSeen, async ({ threadId, seen }, ctx) => ({ seq: 4 }));
 *   // client
 *   const { seq } = await client.call(setSeen, { threadId: "t1", seen: true });
 */

/** A cacheable read at a resource path. Path params (`:name`) and query params become args. */
export interface HttpRoute {
  method: "GET";
  /** e.g. "/boxes/:boxId/messages/:messageId" (relative to the server's base) */
  path: string;
  /** "immutable": the answer never changes (cache for a year). Default "none" (no-store). */
  cache?: "immutable" | "none";
}

/** A node as declared: everything but the hooks that only the server can run. */
export type DeclaredNode<A> = Omit<CommandNode, "run" | "resolve" | "args"> & {
  args?: Array<ArgSpec & { id: Extract<keyof A, string> }>;
};

export interface WireSpec<A = ArgValues, O = unknown> {
  readonly node: DeclaredNode<A>;
  readonly http?: HttpRoute;
  /** codes a caller should expect besides invalidArguments / forbidden (for the reference docs) */
  readonly errors?: readonly string[];
  /** one line on what `data` holds (for the reference docs) */
  readonly returns?: string;
  /** phantom: never set at runtime, only carries the types */
  readonly types?: { args: A; out: O };
}

export interface SpecOptions {
  http?: HttpRoute;
  errors?: readonly string[];
  returns?: string;
}

/** Declare a command. Curried so the arg and result types are explicit and the node is inferred. */
export function defineCommand<A extends object, O>() {
  return (node: DeclaredNode<A>, opts: SpecOptions = {}): WireSpec<A, O> => ({
    node,
    ...(opts.http !== undefined && { http: opts.http }),
    ...(opts.errors !== undefined && { errors: opts.errors }),
    ...(opts.returns !== undefined && { returns: opts.returns }),
  });
}

/** A server-pushed event, declared once so both sides agree on its name and payload. */
export interface EventSpec<D = unknown> {
  readonly name: string;
  readonly summary: string;
  readonly types?: { data: D };
}

export function defineEvent<D>(name: string, summary: string): EventSpec<D> {
  return { name, summary };
}

/**
 * Attach the server-side `run` to a declared command, producing the kernel node.
 * The result is a `data` result: `payload` is what `run` returned, `message` a
 * one-line summary (default: the command title).
 *
 * `C` is the host's context type (its `Ctx` plus whatever it adds: the caller, the
 * environment). The wire server hands every command the context the host built,
 * so the narrowing below is the host's own promise, made in one place.
 */
export function implement<A extends object, O, C extends Ctx = Ctx>(
  spec: WireSpec<A, O>,
  run: (args: A, ctx: C) => Promise<O>,
  message: (out: O) => string = () => spec.node.title,
): CommandNode {
  const node = spec.node as CommandNode; // DeclaredNode only narrows `args` ids; same shape
  return {
    ...node,
    // the kernel validated args against the declared schema before this runs
    run: async (args, ctx) => {
      const out = await run(args as A, ctx as C);
      return { kind: "data", message: message(out), payload: out };
    },
  };
}
