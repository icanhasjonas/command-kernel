import type { CommandNode, CommandResult, Ctx, Kernel, Piped } from "@command-kernel/core";
import { allowLabel, describeType, ruleForNode } from "@command-kernel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArgSession, PipeSession } from "./palette-types.js";
import { usePaletteArgs } from "./usePaletteArgs.js";
import { usePaletteFrames } from "./usePaletteFrames.js";
import { usePaletteGate } from "./usePaletteGate.js";
import { usePalettePipe } from "./usePalettePipe.js";

export type { Mode } from "./palette-types.js";

interface Hooks {
  kernel: Kernel;
  ctx: Ctx;
  roots: CommandNode[];
  open: boolean;
  trigger?: { id: string; nonce: number } | null | undefined;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
  onClose: () => void;
}

/** What to call a value in hand: its own label, its type's, or the type itself. */
export const subjectLabel = (p: Piped) => p.label ?? p.type.label ?? describeType(p.type);

export function usePalette({
  kernel,
  ctx,
  roots,
  open,
  trigger,
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

  const { argOptions, argLoading, commitArg, finishArg } = usePaletteArgs({
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

  const back = useCallback(() => {
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
    if (node) activate(node, false);
  }, [trigger?.nonce]);

  return {
    frames,
    frame,
    ranked,
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
    confirm,
    confirmAlwaysLabel: confirm ? allowLabel(ruleForNode(confirm.node, confirm.values)) : "",
    pipe,
    pipeRows,
    pipeLoading,
    pick,
    startPipe,
    activate,
    back,
    commitArg,
    finishArg,
    confirmProceed,
    confirmAlways,
    drill,
  };
}
