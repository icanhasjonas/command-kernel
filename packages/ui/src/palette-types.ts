import type { ArgValues, CommandNode, GateVerdict, Piped } from "@command-kernel/core";

/** Which layer of the palette is currently driving the UI. */
export type Mode = "browse" | "args" | "confirm" | "pipe";

/** An in-flight argument-collection session for one node. */
export interface ArgSession {
  node: CommandNode;
  values: ArgValues;
  activeArg: string;
  /** the grant's binding context when the node was not reached by browsing (a pipe step) */
  priorKey?: string;
  /** why the last value given for `activeArg` was refused; cleared by the next one */
  error?: string;
}

/** A node waiting on the gate's verdict before it can run. */
export interface ConfirmSession {
  node: CommandNode;
  values: ArgValues;
  verdict: GateVerdict;
  blocked: boolean;
  /** as on `ArgSession`: set for a pipe step, else the browse frames are the context */
  priorKey?: string;
}

/** A value in hand, waiting to be piped into the next command. */
export interface PipeSession {
  subject: Piped;
  /** where the value came from, oldest first ("notes.md", "Load as text") */
  trail: string[];
  /** the value in hand before the last step made this one: Esc goes back to it */
  prev?: PipeSession;
}

/** How to run a node that was not reached by browsing to it. */
export interface RunStart {
  /** args already known (a piped value), laid over the node's prefill */
  values?: ArgValues;
  /** the grant's binding context (a routed action's `priorKey`) */
  priorKey?: string;
}
