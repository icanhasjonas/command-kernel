import type { ConnectionStatus } from "./connection.js";

/**
 * The client's listeners: event handlers by name, and status listeners. A listener
 * that throws is reported to `onError`; an `onError` that throws too is swallowed.
 * Neither may skip the next listener or escape into the socket's onmessage.
 */

type OnError = ((err: unknown, event: string) => void) | undefined;

/** What a status listener is told besides the status itself. */
export interface StatusChange {
  /**
   * True on an "open" that follows an earlier open of this client (after a drop, or a
   * close() and connect()): events pushed in between are lost, so resync now. False
   * on the first open, even after failed attempts, and on every other status.
   */
  reconnected: boolean;
}

export type StatusListener = (status: ConnectionStatus, change: StatusChange) => void;

export function createListeners(onError: OnError) {
  const events = new Map<string, Set<(data: unknown) => void>>();
  const status = new Set<StatusListener>();

  function guarded(call: () => void, event: string) {
    try {
      call();
    } catch (err) {
      try {
        onError?.(err, event);
      } catch {
        // the reporter itself failed; there is nobody left to tell
      }
    }
  }

  // a status change reported while listeners are still being told about the last one
  // (a listener that calls close()) waits its turn: every listener sees the changes in
  // the order they happened, and its last call is the current status
  const pending: Array<[ConnectionStatus, StatusChange]> = [];
  let telling = false;

  return {
    emit(name: string, data: unknown) {
      for (const fn of [...(events.get(name) ?? [])]) guarded(() => fn(data), name);
    },
    on(name: string, fn: (data: unknown) => void) {
      const set = events.get(name) ?? new Set();
      set.add(fn);
      events.set(name, set);
      return () => {
        set.delete(fn);
        if (set.size === 0 && events.get(name) === set) events.delete(name);
      };
    },
    status(s: ConnectionStatus, change: StatusChange) {
      pending.push([s, change]);
      if (telling) return;
      telling = true;
      try {
        for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
          const [st, ch] = next;
          for (const fn of [...status]) guarded(() => fn(st, ch), "status");
        }
      } finally {
        telling = false;
      }
    },
    /** Add a status listener and tell it `now` at once (a late listener learns where things stand). */
    onStatus(fn: StatusListener, now: ConnectionStatus, change: StatusChange) {
      status.add(fn);
      guarded(() => fn(now, change), "status");
      return () => {
        status.delete(fn);
      };
    },
  };
}
