import type { CommandNode, CommandResult, Ctx, Kernel } from "@command-kernel/core";
import { allowLabel, ruleForNode } from "@command-kernel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArgSession } from "./palette-types.js";
import { usePaletteArgs } from "./usePaletteArgs.js";
import { usePaletteFrames } from "./usePaletteFrames.js";
import { usePaletteGate } from "./usePaletteGate.js";

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
  // shared "latest request wins" cancellation counter — the browse-frame
  // re-resolve and the arg-value completion effect both race against it
  const token = useRef(0);

  // the arg session lives here, not inside usePaletteArgs: the gate flow
  // (usePaletteGate) also has to open one when the kernel refuses a run for
  // missing args, so both hooks need to read and write it.
  const [arg, setArg] = useState<ArgSession | null>(null);
  const [argQuery, setArgQuery] = useState("");

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

  const { confirm, setConfirm, proceedGate, confirmProceed, confirmAlways, activate } =
    usePaletteGate({
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

  const back = useCallback(() => {
    if (mode === "args" || mode === "confirm") {
      setMode("browse");
      setArg(null);
      setConfirm(null);
      return;
    }
    if (frames.length > 1) {
      setFrames((f) => f.slice(0, -1));
      setQuery("");
      setSelected(0);
      return;
    }
    onClose();
  }, [mode, frames.length, onClose, setMode, setConfirm, setFrames, setQuery, setSelected]);

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
    activate,
    back,
    commitArg,
    finishArg,
    confirmProceed,
    confirmAlways,
    drill,
  };
}
