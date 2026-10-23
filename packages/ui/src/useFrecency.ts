import { bumpFrecency } from "@command-kernel/core";
import { useCallback, useState } from "react";

/** Where `useFrecency` keeps its scores between visits: `localStorage`, or your own. */
export type FrecencyStorage = Pick<Storage, "getItem" | "setItem">;

export interface FrecencyOptions {
  /** the key the scores are kept under; absent = kept in memory only */
  storageKey?: string;
  /** default `globalThis.localStorage` where there is one */
  storage?: FrecencyStorage;
}

function read(storage: FrecencyStorage | undefined, key: string | undefined) {
  if (!storage || !key) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    // keep only numbers: a hand-edited or older value never reaches the ranker
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === "number"),
    );
  } catch {
    return {};
  }
}

/**
 * The palette's memory of what you run: `frecency` goes into `ctx.frecency` (the kernel's
 * ranker lifts what you use), `bump` into `<CommandPalette onExecuted>`. With a `storageKey`
 * it survives a reload.
 *
 *   const { frecency, bump } = useFrecency({ storageKey: "acme.palette" });
 *   const ctx = useMemo(() => ({ ...base, frecency }), [base, frecency]);
 *   <CommandPalette ctx={ctx} onExecuted={bump} ... />
 */
export function useFrecency(options: FrecencyOptions = {}) {
  const { storageKey } = options;
  const storage =
    options.storage ??
    (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage);
  const [frecency, setFrecency] = useState<Record<string, number>>(() => read(storage, storageKey));

  const bump = useCallback(
    (id: string) =>
      setFrecency((current) => {
        const next = bumpFrecency(current, id);
        if (storage && storageKey) {
          try {
            storage.setItem(storageKey, JSON.stringify(next));
          } catch {
            // a full or blocked storage keeps the score for this visit only
          }
        }
        return next;
      }),
    [storage, storageKey],
  );

  return { frecency, bump };
}
