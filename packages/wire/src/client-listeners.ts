import type { ConnectionStatus } from "./connection.js";

/**
 * The client's listeners: event handlers by name, and status listeners. A listener
 * that throws is reported to `onError`; an `onError` that throws too is swallowed.
 * Neither may skip the next listener or escape into the socket's onmessage.
 */

type OnError = ((err: unknown, event: string) => void) | undefined;

export function createListeners(onError: OnError) {
  const events = new Map<string, Set<(data: unknown) => void>>();
  const status = new Set<(s: ConnectionStatus) => void>();

  function guarded<T>(fn: (v: T) => void, v: T, event: string) {
    try {
      fn(v);
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
  const pending: ConnectionStatus[] = [];
  let telling = false;

  return {
    emit(name: string, data: unknown) {
      for (const fn of [...(events.get(name) ?? [])]) guarded(fn, data, name);
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
    status(s: ConnectionStatus) {
      pending.push(s);
      if (telling) return;
      telling = true;
      try {
        for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
          for (const fn of [...status]) guarded(fn, next, "status");
        }
      } finally {
        telling = false;
      }
    },
    /** Add a status listener and tell it `now` at once (a late listener learns where things stand). */
    onStatus(fn: (s: ConnectionStatus) => void, now: ConnectionStatus) {
      status.add(fn);
      guarded(fn, now, "status");
      return () => {
        status.delete(fn);
      };
    },
  };
}
