import type { ArgOption, ArgValues, CommandNode, Ctx, Kernel } from "@command-kernel/core";
import { argList, entityOption, freeValueError, missingArgs } from "@command-kernel/core";
import { type RefObject, useCallback, useEffect, useState } from "react";
import type { ArgSession, Mode } from "./palette-types.js";
import type { Proceed } from "./usePaletteGate.js";

interface ArgsHookArgs {
  ctx: Ctx;
  kernel: Kernel;
  mode: Mode;
  arg: ArgSession | null;
  setArg: (session: ArgSession | null) => void;
  argQuery: string;
  setArgQuery: (query: string) => void;
  setMode: (mode: Mode) => void;
  setSelected: (selected: number) => void;
  /** shared with `usePaletteFrames`: one "latest request wins" counter across both */
  token: RefObject<number>;
  /** run once every required arg is collected */
  proceedGate: (node: CommandNode, values: ArgValues, opts?: Proceed) => Promise<void>;
}

/**
 * An entity arg's options in the kernel's own order: the same ranker that orders the
 * rows when you drill into a list, so "jon" puts Jon Snow above Jonas in both places.
 * The catalog's search finds them; it does not get to rank them differently.
 */
function rankOptions(kernel: Kernel, opts: ArgOption[], query: string, ctx: Ctx): ArgOption[] {
  if (!query.trim() || opts.length < 2) return opts;
  const nodes: CommandNode[] = opts.map((o) => ({
    id: o.value,
    title: o.label,
    ...(o.hint !== undefined && { keywords: [o.hint] }),
  }));
  const byId = new Map(opts.map((o) => [o.value, o]));
  const ranked = kernel.search(nodes, query, ctx).flatMap((r) => byId.get(r.node.id) ?? []);
  // the catalog found what the ranker does not match (a hint-only hit): keep it, last
  const seen = new Set(ranked.map((o) => o.value));
  return [...ranked, ...opts.filter((o) => !seen.has(o.value))];
}

/**
 * Argument collection's value side: the completion source for the active arg
 * (enum, entity catalog, or a custom `complete`), and advancing through a
 * node's remaining required args before handing off to `proceedGate`.
 *
 * The session itself (`arg`, `argQuery`) lives in the composing hook, because
 * the gate flow (`usePaletteGate`) also has to start one when the kernel
 * refuses a run for missing args.
 */
export function usePaletteArgs({
  ctx,
  kernel,
  mode,
  arg,
  setArg,
  argQuery,
  setArgQuery,
  setMode,
  setSelected,
  token,
  proceedGate,
}: ArgsHookArgs) {
  const [argOptions, setArgOptions] = useState<ArgOption[]>([]);
  const [argLoading, setArgLoading] = useState(false);
  // the query the options on screen were found for: Enter must not commit a row found
  // for what was typed a keystroke ago (type an address fast, hit Enter, get a stranger)
  const [optionsFor, setOptionsFor] = useState<string | null>(null);

  // arg-scoped value completion
  useEffect(() => {
    if (mode !== "args" || !arg) return;
    const show = (opts: ArgOption[]) => {
      setArgOptions(opts);
      setOptionsFor(argQuery);
    };
    const spec = arg.node.args?.find((a) => a.id === arg.activeArg);
    if (!spec) return show([]);
    if (spec.enumValues) {
      const q = argQuery.toLowerCase();
      const hits = spec.enumValues.filter((o) => o.label.toLowerCase().includes(q));
      // a closed list that matches nothing still shows every choice (the palette says so)
      return show(hits.length > 0 ? hits : spec.enumValues);
    }
    // entity-typed arg: the registered entity catalog is the completion source
    if (spec.entity && kernel.entities) {
      const mine = ++token.current;
      setArgLoading(true);
      kernel.entities
        .search(
          spec.entity.type,
          argQuery,
          ctx,
          spec.entity.constraint !== undefined ? { constraint: spec.entity.constraint } : undefined,
        )
        .then((found) => {
          if (mine !== token.current) return;
          show(rankOptions(kernel, found.map(entityOption), argQuery, ctx));
          setArgLoading(false);
        });
      return;
    }
    if (!spec.complete) return show([]);
    const mine = ++token.current;
    setArgLoading(true);
    spec.complete(argQuery, ctx).then((opts) => {
      if (mine !== token.current) return;
      show(opts);
      setArgLoading(false);
    });
  }, [mode, arg, argQuery, ctx, kernel, token]);

  const advanceOrRun = useCallback(
    ({ error: _answered, ...session }: ArgSession) => {
      const remaining = missingArgs(session.node, session.values).filter(
        (id) => id !== session.activeArg,
      );
      if (remaining.length > 0) {
        setArg({ ...session, activeArg: remaining[0] as string });
        setArgQuery("");
        setSelected(0);
        return;
      }
      setMode("browse");
      setArg(null);
      void proceedGate(
        session.node,
        session.values,
        session.priorKey !== undefined ? { priorKey: session.priorKey } : {},
      );
    },
    [proceedGate, setMode, setSelected, setArg, setArgQuery],
  );

  // commit a value for the active arg. A `multiple` arg ACCUMULATES and stays put
  // (call finishArg to move on); a single arg advances to the next missing one.
  const commitArg = useCallback(
    (value: string) => {
      if (!arg) return;
      const spec = arg.node.args?.find((a) => a.id === arg.activeArg);
      // a value typed by hand (not one of the options) for an entity arg: the kernel's
      // own rule, asked now, so "bob at home" is refused here, not after every other arg
      const typedByHand = !argOptions.some((o) => o.value === value);
      const why =
        spec?.entity && typedByHand && kernel.entities
          ? freeValueError(spec.entity, value, kernel.entities)
          : null;
      if (why) {
        setArg({ ...arg, error: why });
        return;
      }
      if (spec?.multiple) {
        const { error: _answered, ...rest } = arg;
        const next = [...argList(arg.values[arg.activeArg]), value];
        setArg({ ...rest, values: { ...arg.values, [arg.activeArg]: next } });
        setArgQuery("");
        setSelected(0);
        return;
      }
      advanceOrRun({ ...arg, values: { ...arg.values, [arg.activeArg]: value } });
    },
    [arg, argOptions, kernel, advanceOrRun, setArg, setArgQuery, setSelected],
  );

  // done adding to a `multiple` arg -> advance to the next missing arg (or run)
  const finishArg = useCallback(() => {
    if (arg) advanceOrRun(arg);
  }, [arg, advanceOrRun]);

  return {
    argOptions,
    argLoading,
    argOptionsFresh: optionsFor === argQuery,
    commitArg,
    finishArg,
  };
}
