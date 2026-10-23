import {
  type CommandNode,
  type CommandResult,
  type Ctx,
  disabledReason,
  type Kernel,
} from "@command-kernel/core";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { type PaletteLabelOverrides, resolveLabels } from "./labels.js";
import { PaletteBody } from "./PaletteBody.js";
import { PaletteDialog, PaletteInline } from "./PaletteDialog.js";
import { PaletteFooter } from "./PaletteFooter.js";
import { PaletteHeader } from "./PaletteHeader.js";
import { PaletteQuery } from "./PaletteQuery.js";
import { type Mode, type PaletteArrange, type PaletteTrigger, usePalette } from "./usePalette.js";
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
  /**
   * The host lays out the root list itself: its own groups first, a "Recent" group, the
   * rows it cannot run last. Gets the ranked commands and the sources' rows, returns every row
   * in the order drawn. Default: the commands, then the sources' rows, grouped by category.
   */
  arrange?: PaletteArrange;
  /** what the search box holds as the palette opens ("Threads with Dana": her address) */
  initialQuery?: string;
  /**
   * A key in the palette, before the palette's own keys: answer `true` and the palette leaves
   * it alone (a host key that opens its help, a key the host keeps for itself).
   */
  onKeyDown?: (event: KeyboardEvent, state: { query: string; mode: Mode }) => boolean | undefined;
  /**
   * The host's own controls at the end of the footer (Close, Help), on touch screens too; a
   * function draws them for the query and mode on screen (a key shown only while nothing is typed).
   */
  footer?: ReactNode | ((state: { query: string; mode: Mode }) => ReactNode);
  /** every word the palette says; unset keys keep the English default */
  labels?: PaletteLabelOverrides;
  /** show each node's authoring `weight` in its row (an authoring diagnostic) */
  showWeight?: boolean;
  /**
   * Draw it in place, open, as a panel on the page instead of a dialog (a showcase, a docs
   * page): no overlay, no focus trap, and it takes focus only when clicked.
   */
  inline?: boolean;
  onClose: () => void;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
  /**
   * A command is about to run (its args, gate and any confirm have passed) and the palette
   * closes for it now, before the run, unless the command hands a value on. `onClose` follows
   * at once; this says the close is for `node`, so a host can leave focus to what it opens.
   */
  onRun?: (node: CommandNode) => void;
  /** a run (or its gate) threw; the palette has closed. Default: `console.error` */
  onError?: (error: unknown, node: CommandNode) => void;
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
  arrange,
  initialQuery,
  onKeyDown,
  footer,
  labels,
  showWeight = false,
  inline = false,
  onClose,
  onResult,
  onExecuted,
  onRun,
  onError,
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
    arrange,
    initialQuery,
    onResult,
    onExecuted,
    onClose,
    onRun,
    onError,
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
    // in place on a page, it never takes focus from the page by itself
    if (inline) return;
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

  const handleKey = (e: KeyboardEvent) => {
    // not defaultPrevented: Radix prevents Esc before any handler of ours sees it
    if (onKeyDown?.(e, { query: p.query, mode: p.mode }) === true) return;
    keys.onKeyDown(e);
  };
  const body = (
    <>
      <PaletteHeader
        crumbs={[...p.frames.map((f) => f.node?.title ?? text.root), ...(p.pipe?.trail ?? [])]}
        canGoBack={p.mode !== "browse" || p.frames.length > 1}
        backLabel={text.back}
        context={text.context(ctx.location.label ?? ctx.location.module, ctx.user.role)}
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
        host={typeof footer === "function" ? footer({ query: p.query, mode: p.mode }) : footer}
      />
    </>
  );
  if (inline)
    return (
      <PaletteInline title={text.title} onKeyDown={handleKey}>
        {body}
      </PaletteInline>
    );
  return (
    <PaletteDialog
      open={open}
      onClose={onClose}
      onKeyDown={handleKey}
      onCloseAutoFocus={onCloseAutoFocus}
      title={text.title}
      description={text.description}
    >
      {body}
    </PaletteDialog>
  );
}
