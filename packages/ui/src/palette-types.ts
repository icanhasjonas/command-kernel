import type { ArgValues, CommandNode, GateVerdict } from "@command-kernel/core";

/** Which layer of the palette is currently driving the UI. */
export type Mode = "browse" | "args" | "confirm";

/** An in-flight argument-collection session for one node. */
export interface ArgSession {
  node: CommandNode;
  values: ArgValues;
  activeArg: string;
}

/** A node waiting on the gate's verdict before it can run. */
export interface ConfirmSession {
  node: CommandNode;
  values: ArgValues;
  verdict: GateVerdict;
  blocked: boolean;
}
