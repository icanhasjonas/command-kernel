import type { CommandNode, Ctx, Kernel, PipeAction, RankedAction } from "@command-kernel/core";
import { bindInput, rankActions } from "@command-kernel/core";
import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import type { Mode, PipeSession, RunStart } from "./palette-types.js";

interface PipeHookArgs {
  kernel: Kernel;
  ctx: Ctx;
  mode: Mode;
  pipe: PipeSession | null;
  query: string;
  /** shared "latest request wins" counter */
  token: RefObject<number>;
  beginExecute: (node: CommandNode, start?: RunStart) => void;
}

/** A routed action as a palette row: ranked like any node, carrying where the value lands. */
export type PipeRow = RankedAction;

/**
 * Pipe mode: a value is in hand (a file you picked, the text a command just made),
 * and the list is every command that can take it (`kernel.actionsFor`), ranked by
 * what you type. Picking one binds the value into its accepting arg and hands the
 * node to the ordinary arg + gate flow, keyed to the action's own path.
 */
export function usePalettePipe({
  kernel,
  ctx,
  mode,
  pipe,
  query,
  token,
  beginExecute,
}: PipeHookArgs) {
  const [actions, setActions] = useState<PipeAction[]>([]);
  const [loading, setLoading] = useState(false);
  const subject = pipe?.subject;

  // route once per value; typing only re-ranks
  useEffect(() => {
    if (mode !== "pipe" || !subject) return;
    const mine = ++token.current;
    setLoading(true);
    kernel.actionsFor(subject.type, ctx).then((found) => {
      if (mine !== token.current) return;
      setActions(found);
      setLoading(false);
    });
  }, [mode, subject, ctx, kernel, token]);

  const rows = useMemo(
    () => rankActions(actions, query, ctx, kernel.ranker),
    [actions, query, ctx, kernel],
  );

  const pick = useCallback(
    (action: PipeAction) => {
      if (!subject) return;
      const bound = bindInput(action.node, {}, subject);
      if ("error" in bound) return; // routing already chose an arg that fits
      beginExecute(action.node, { values: bound.values, priorKey: action.priorKey });
    },
    [subject, beginExecute],
  );

  return { pipeRows: rows, pipeLoading: loading, pick };
}
