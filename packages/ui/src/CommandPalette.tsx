import {
  type CommandNode,
  type CommandResult,
  type Ctx,
  disabledReason,
  type Kernel,
} from "@command-kernel/core";
import { type ReactNode, useEffect, useState } from "react";
import { type PaletteLabelOverrides, resolveLabels } from "./labels.js";
import { PaletteBody } from "./PaletteBody.js";
import { PaletteDialog } from "./PaletteDialog.js";
import { PaletteFooter } from "./PaletteFooter.js";
import { PaletteHeader } from "./PaletteHeader.js";
import { PaletteQuery } from "./PaletteQuery.js";
import { type PaletteTrigger, usePalette } from "./usePalette.js";
import { usePaletteKeys } from "./usePaletteKeys.js";
import type { PaletteSource } from "./usePaletteSources.js";

export interface CommandPaletteProps {
  open: boolean;
  kernel: Kernel;
  ctx: Ctx;
  roots: CommandNode[];
  /** jump straight into a command, with any args already known */
  trigger?: PaletteTrigger | null;
  /**
   * Entity types to search at the root alongside commands, e.g. `["person", "file"]`.
   * A hit is a row for that thing: pick it and the palette lists what can take it.
   */
  subjects?: readonly string[];
  /**
   * The host's own searches (threads by text, orders by number), run at the root after the
   * commands. Each hit is a CommandNode, so it runs, drills or pipes like any row.
   */
  sources?: readonly PaletteSource[];
  /** something of the host's at the end of a row (a count, a state); `active` is the highlighted one */
  rowAdornment?: (node: CommandNode, state: { active: boolean }) => ReactNode;
  /** every word the palette says; unset keys keep the English default */
  labels?: PaletteLabelOverrides;
  /** show each node's authoring `weight` in its row (an authoring diagnostic) */
  showWeight?: boolean;
  onClose: () => void;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
  /**
   * The palette has closed (its exit is done) and is about to put focus back on the element
   * that had it before it opened. Call `event.preventDefault()` to put focus somewhere yourself.
   */
  onCloseAutoFocus?: (event: Event) => void;
}

export function CommandPalette({
  open,
  kernel,
  ctx,
  roots,
  trigger,
  subjects,
  sources,
  rowAdornment,
  labels,
  showWeight = false,
  onClose,
  onResult,
  onExecuted,
  onCloseAutoFocus,
}: CommandPaletteProps) {
  const text = resolveLabels(labels);
  const p = usePalette({
    kernel,
    ctx,
    roots,
    open,
    trigger,
    subjects,
    sources,
    onResult,
    onExecuted,
    onClose,
  });
  const [modHeld, setModHeld] = useState(false);
  const keys = usePaletteKeys(p);

  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) =>
      (e.key === "Meta" || e.key === "Control") && setModHeld(true);
    const up = (e: globalThis.KeyboardEvent) =>
      (e.key === "Meta" || e.key === "Control") && setModHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus follows mode/arg
  useEffect(() => {
    const t = setTimeout(
      () => (p.mode === "args" ? keys.argRef : keys.browseRef).current?.focus(),
      10,
    );
    return () => clearTimeout(t);
  }, [p.mode, p.arg?.activeArg]);

  const selectedNode = p.ranked[p.selected]?.node;
  const extras = {
    disabledReason: (n: CommandNode) => disabledReason(n, ctx),
    adornment: rowAdornment,
  };

  return (
    <PaletteDialog
      open={open}
      onClose={onClose}
      onKeyDown={keys.onKeyDown}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <PaletteHeader
        crumbs={[...p.frames.map((f) => f.node?.title ?? text.root), ...(p.pipe?.trail ?? [])]}
        canGoBack={p.mode !== "browse" || p.frames.length > 1}
        backLabel={text.back}
        where={ctx.location.label ?? ctx.location.module}
        role={ctx.user.role}
        onBack={p.back}
      />
      <PaletteQuery p={p} keys={keys} labels={text} />
      <PaletteBody
        p={p}
        keys={keys}
        ctx={ctx}
        labels={text}
        modHeld={modHeld}
        showWeight={showWeight}
        extras={extras}
      />
      <PaletteFooter
        mode={p.mode}
        blocked={Boolean(p.confirm?.blocked)}
        empty={p.mode === "browse" && p.ranked.length === 0}
        drillable={p.mode === "browse" && Boolean(selectedNode?.resolve)}
        pipeable={p.mode === "browse" && Boolean(selectedNode?.subject)}
        modHeld={modHeld}
        labels={text}
      />
    </PaletteDialog>
  );
}
