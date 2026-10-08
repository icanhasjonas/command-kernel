import type {
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  Kernel,
  Piped,
  Ranked,
} from "@command-kernel/core";
import { allowLabel, describeType, ruleForNode } from "@command-kernel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArgSession, PipeSession } from "./palette-types.js";
import { usePaletteArgs } from "./usePaletteArgs.js";
import { usePaletteFrames } from "./usePaletteFrames.js";
import { usePaletteGate } from "./usePaletteGate.js";
import { usePalettePipe } from "./usePalettePipe.js";
import { usePaletteSubjects } from "./usePaletteSubjects.js";

export type { Mode } from "./palette-types.js";

/**
 * Jump straight into a command (a chord, a deeplink): its id, a nonce so the same jump
 * fires twice, and the args already known, which the palette then asks only the rest of.
 */
export interface PaletteTrigger {
  id: string;
  nonce: number;
  values?: ArgValues;
}

interface Hooks {
  kernel: Kernel;
  ctx: Ctx;
  roots: CommandNode[];
  open: boolean;
  trigger?: PaletteTrigger | null | undefined;
  /** entity types searched at the root alongside commands (see usePaletteSubjects) */
  subjects?: readonly string[] | undefined;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
  onClose: () => void;
}

const NONE: readonly string[] = [];

/**
 * Commands and things in ONE ranking, by the kernel's own ranker: "ada" puts Ada
 * Lovelace above a command that merely contains a, d, a. A thing the search found by
 * something the ranker does not read (an email, a hint) still shows, after the rest.
 */
function withThings(
  kernel: Kernel,
  items: CommandNode[],
  things: Ranked[],
  query: string,
  ctx: Ctx,
): Ranked[] {
  const ranked = kernel.search([...items, ...things.map((t) => t.node)], query, ctx);
  const shown = new Set(ranked.map((r) => r.node.id));
  return [...ranked, ...things.filter((t) => !shown.has(t.node.id))];
}

/** What to call a value in hand: its own label, its type's, or the type itself. */
export const subjectLabel = (p: Piped) => p.label ?? p.type.label ?? describeType(p.type);

export function usePalette({
  kernel,
  ctx,
  roots,
  open,
  trigger,
  subjects,
  onResult,
  onExecuted,
  onClose,
}: Hooks) {
  // shared "latest request wins" cancellation counter - the browse-frame
  // re-resolve and the arg-value completion effect both race against it
  const token = useRef(0);

  // the arg session lives here, not inside usePaletteArgs: the gate flow
  // (usePaletteGate) also has to open one when the kernel refuses a run for
  // missing args, so both hooks need to read and write it.
  const [arg, setArg] = useState<ArgSession | null>(null);
  const [argQuery, setArgQuery] = useState("");
  // the value in hand, for the same reason: picking a subject starts it, and a
  // run that produces something (usePaletteGate) carries it on
  const [pipe, setPipe] = useState<PipeSession | null>(null);

  const {
    frames,
    setFrames,
    frame,
    ranked,
    query,
    setQuery,
    selected,
    setSelected,
    move,
    mode,
    setMode,
    resolving,
    drill,
    ancestorKey,
  } = usePaletteFrames({ kernel, ctx, roots, token });

  const { rows: things, fresh: rankedFresh } = usePaletteSubjects({
    kernel,
    ctx,
    query,
    active: mode === "browse" && frames.length === 1,
    types: subjects ?? NONE,
  });
  const rows = useMemo(
    () => (things.length > 0 ? withThings(kernel, frame.items, things, query, ctx) : ranked),
    [things, ranked, kernel, frame.items, query, ctx],
  );

  const enterPipe = useCallback(
    (next: PipeSession) => {
      setPipe(next);
      setMode("pipe");
      setQuery("");
      setSelected(0);
    },
    [setMode, setQuery, setSelected],
  );

  const startPipe = useCallback(
    (subject: Piped) => enterPipe({ subject, trail: [subjectLabel(subject)] }),
    [enterPipe],
  );

  // a run made something: it becomes the value in hand, its command joins the trail
  const onOutput = useCallback(
    (value: Piped, from: CommandNode) => {
      setArg(null);
      enterPipe({
        subject: value,
        trail: [...(pipe?.trail ?? []), from.title],
        ...(pipe && { prev: pipe }),
      });
    },
    [pipe, enterPipe],
  );

  const {
    confirm,
    setConfirm,
    proceedGate,
    confirmProceed,
    confirmAlways,
    beginExecute,
    activate: gateActivate,
  } = usePaletteGate({
    ctx,
    kernel,
    ancestorKey,
    drill,
    setMode,
    setSelected,
    setArg,
    setArgQuery,
    onResult,
    onExecuted,
    onClose,
    onOutput,
  });

  const { argOptions, argLoading, argOptionsFresh, commitArg, finishArg } = usePaletteArgs({
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
  });

  const { pipeRows, pipeLoading, pick } = usePalettePipe({
    kernel,
    ctx,
    pipe,
    query,
    token,
    beginExecute,
  });

  // a node that only stands for a value (a file, no run, no children) opens its actions
  const activate = useCallback(
    (node: CommandNode, exec: boolean) => {
      if (node.subject && !node.run && !node.resolve) return startPipe(node.subject);
      gateActivate(node, exec);
    },
    [startPipe, gateActivate],
  );

  // the palette was opened ON a command (a trigger), not browsed to it
  const openedOn = useRef(false);

  /** Leave the confirm (or the args) for the list, keeping the palette open. */
  const dropConfirm = useCallback(() => {
    // from here on it is a palette the person is browsing, not one opened on a command
    openedOn.current = false;
    setMode(pipe ? "pipe" : "browse");
    setArg(null);
    setConfirm(null);
  }, [pipe, setMode, setConfirm]);

  const back = useCallback(() => {
    // opened ON a command (a link, a chord, a button): its cancel closes the palette,
    // there is no list behind it the person came from
    if ((mode === "args" || mode === "confirm") && openedOn.current && !pipe && frames.length === 1)
      return onClose();
    if (mode === "args" || mode === "confirm") {
      // a pipe step backs out to the value in hand, not to the browse list
      setMode(pipe ? "pipe" : "browse");
      setArg(null);
      setConfirm(null);
      return;
    }
    if (mode === "pipe") {
      // one step back along the chain: a value a run made is never thrown away
      // with the whole pipe by a single key
      if (pipe?.prev) return enterPipe(pipe.prev);
      setPipe(null);
      setMode("browse");
      setQuery("");
      setSelected(0);
      return;
    }
    if (frames.length > 1) {
      setFrames((f) => f.slice(0, -1));
      setQuery("");
      setSelected(0);
      return;
    }
    onClose();
  }, [
    mode,
    pipe,
    enterPipe,
    frames.length,
    onClose,
    setMode,
    setConfirm,
    setFrames,
    setQuery,
    setSelected,
  ]);

  // reset to root whenever the palette opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: open-edge reset only
  useEffect(() => {
    if (!open) return;
    openedOn.current = false;
    setFrames([{ node: null, items: roots, dynamic: false, args: {} }]);
    setQuery("");
    setSelected(0);
    setMode("browse");
    setArg(null);
    setConfirm(null);
    setPipe(null);
  }, [open]);

  // chord leader: jump straight into a command's execute/drill flow
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire on nonce only
  useEffect(() => {
    if (!trigger) return;
    const node = roots.find((n) => n.id === trigger.id);
    if (!node) return;
    openedOn.current = true;
    // args the jump already knows (a deeplink's): ask only for the rest
    if (trigger.values) beginExecute(node, { values: trigger.values });
    else activate(node, false);
  }, [trigger?.nonce]);

  return {
    frames,
    frame,
    ranked: rows,
    /** false while the people/things for the current query are still on their way */
    rankedFresh,
    query,
    setQuery,
    selected,
    setSelected,
    move,
    mode,
    resolving,
    arg,
    argQuery,
    setArgQuery,
    argOptions,
    argLoading,
    argOptionsFresh,
    confirm,
    confirmAlwaysLabel: confirm ? allowLabel(ruleForNode(confirm.node, confirm.values)) : "",
    pipe,
    pipeRows,
    pipeLoading,
    pick,
    startPipe,
    activate,
    back,
    dropConfirm,
    commitArg,
    finishArg,
    confirmProceed,
    confirmAlways,
    drill,
  };
}
