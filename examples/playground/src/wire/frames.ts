import { useSyncExternalStore } from "react";

/** One message as it crossed the network: the exact text, which way, and on which transport. */
export interface Frame {
  id: number;
  at: number;
  dir: "out" | "in";
  via: "ws" | "http";
  /** for HTTP: the request line going out, the status coming back */
  head?: string;
  text: string;
}

let frames: Frame[] = [];
let seq = 0;
const listeners = new Set<() => void>();

export const frameStore = {
  record(f: Omit<Frame, "id" | "at">) {
    frames = [{ ...f, id: ++seq, at: Date.now() }, ...frames].slice(0, 40);
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => frames,
};

export function useFrames(): Frame[] {
  return useSyncExternalStore(frameStore.subscribe, frameStore.snapshot, frameStore.snapshot);
}
