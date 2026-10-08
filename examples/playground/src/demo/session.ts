import { useSyncExternalStore } from "react";
import { kernel } from "./kernel";

/**
 * A new session: the signing key rotates and every always-allow rule goes, so every
 * grant minted so far stops verifying. Counted, so what shows a grant (the Gate lab's
 * card) can mark it void when it happens, wherever it was asked for.
 */
let epoch = 0;
const listeners = new Set<() => void>();

export function newSession() {
  kernel.evidence.rotate();
  kernel.policy.clear();
  epoch += 1;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** How many new sessions this page has started: a change means every grant is void. */
export const useSessionEpoch = () =>
  useSyncExternalStore(
    subscribe,
    () => epoch,
    () => epoch,
  );
