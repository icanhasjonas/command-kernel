import { useSyncExternalStore } from "react";
import type { Flag } from "./spec";

/**
 * The lab's flags as this tab last heard them from the server, for chrome outside
 * the Wire section (the header's banner). The Wire section's connection writes it;
 * nothing else does. Off until the server has said otherwise.
 */
let flags: Partial<Record<Flag, boolean>> = {};
const listeners = new Set<() => void>();

export const labFlags = {
  set(next: Record<Flag, boolean>) {
    flags = next;
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => flags,
};

export function useLabFlag(flag: Flag): boolean {
  return (
    useSyncExternalStore(labFlags.subscribe, labFlags.snapshot, labFlags.snapshot)[flag] === true
  );
}
