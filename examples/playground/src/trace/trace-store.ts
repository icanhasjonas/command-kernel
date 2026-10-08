import type { ArgValue, ArgValues, GateCheck, Piped } from "@command-kernel/core";
import { useSyncExternalStore } from "react";

/**
 * Which driver made a call. Each one holds its own tap on the page's ONE kernel, except
 * `wire`, whose calls go to the server's kernel (the lab) over HTTP or a socket.
 */
export type Driver =
  | "palette"
  | "chord"
  | "deeplink"
  | "invoker"
  | "agent"
  | "pipe"
  | "gate-lab"
  | "wire";

/**
 * How far a call got through the kernel:
 * unresolved (no such command) · args (missing or invalid) · blocked (the gate said no) ·
 * owed (the gate wants an approval) · ran · unreached (the network or a rate limit stopped
 * it before any kernel saw it) · mistyped (a piped value of a shape the command does not take).
 */
export type Outcome =
  | "unresolved"
  | "args"
  | "pick"
  | "blocked"
  | "owed"
  | "ran"
  | "unreached"
  | "mistyped";

/** What the evidence did: none presented, verified, refused, or a standing always-allow rule. */
export type GrantState = "none" | "verified" | "refused" | "policy";

export interface TraceEntry {
  id: number;
  at: number;
  driver: Driver;
  command: string;
  title: string;
  args: ArgValues;
  input?: Piped;
  outcome: Outcome;
  /** the gate's checks (the failing one explains a block) */
  checks: GateCheck[];
  /** missing / invalid args, by name */
  problems: string[];
  grant: GrantState;
  /** the signature that was presented, shortened for display */
  sig?: string;
  message?: string;
  value?: ArgValue;
}

let entries: TraceEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

export const traceStore = {
  record(e: Omit<TraceEntry, "id" | "at">) {
    entries = [{ ...e, id: ++seq, at: Date.now() }, ...entries].slice(0, 60);
    emit();
  },
  clear() {
    entries = [];
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => entries,
};

export function useTrace(): TraceEntry[] {
  return useSyncExternalStore(traceStore.subscribe, traceStore.snapshot, traceStore.snapshot);
}
