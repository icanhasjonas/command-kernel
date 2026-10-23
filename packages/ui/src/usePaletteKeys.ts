import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { PaletteState } from "./usePalette.js";

/**
 * The palette's keyboard, over the palette's state: arrows, Enter, Tab, Esc and the arrows
 * that drill, plus the two waits (an Enter that waits for the rows of what was just typed).
 * Also what the arg line decides from the active arg: whether a typed value is taken, and
 * whether what was typed matches none of a closed arg's options.
 */
export function usePaletteKeys(p: PaletteState) {
  const browseRef = useRef<HTMLInputElement>(null);
  const argRef = useRef<HTMLInputElement>(null);
  // the browse list's id: the search input is the combobox that controls it
  const listId = useId();

  const activeSpec = p.arg?.node.args?.find((a) => a.id === p.arg?.activeArg);
  // a value typed by hand is offered only where the arg takes one: not a closed list, and
  // not an entity that must exist (the kernel would refuse it anyway)
  const freeText = activeSpec
    ? activeSpec.kind !== "enum" && !(activeSpec.entity && !activeSpec.entity.open)
    : false;
  // typed something a closed arg has no option for: say so instead of going quiet
  const typed = p.argQuery.trim().toLowerCase();
  const unmatched =
    !freeText &&
    typed !== "" &&
    !p.argLoading &&
    (activeSpec?.enumValues
      ? !activeSpec.enumValues.some((o) => o.label.toLowerCase().includes(typed))
      : p.argOptions.length === 0);

  // an arrow key since the last keystroke: the highlighted row is a choice, not a default
  const [picked, setPicked] = useState(false);
  const pendingCommit = useRef(false);

  /** Enter on an arg: the highlighted row, else the typed value where the arg takes one. */
  function commitArg() {
    // a closed arg that matches nothing commits nothing until a row is actually chosen
    const opt = unmatched && !picked ? undefined : p.argOptions[p.selected];
    if (opt) return p.commitArg(opt.value);
    if (freeText && p.argQuery.trim()) return p.commitArg(p.argQuery.trim());
    // a multiple arg: Enter on an empty input means "done adding" -> advance
    if (activeSpec?.multiple && !p.argQuery.trim()) return p.finishArg();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fires when the rows catch up
  useEffect(() => {
    if (!p.argOptionsFresh || !pendingCommit.current) return;
    pendingCommit.current = false;
    commitArg();
  }, [p.argOptionsFresh]);

  const pendingActivate = useRef<{ asPage: boolean } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires when the rows catch up
  useEffect(() => {
    const pending = pendingActivate.current;
    if (!p.rankedFresh || !pending) return;
    pendingActivate.current = null;
    const sel = p.ranked[p.selected];
    if (sel && p.mode === "browse") p.activate(sel.node, pending.asPage);
  }, [p.rankedFresh]);

  function onKeyDown(e: KeyboardEvent) {
    // typing again cancels an Enter that was waiting for the old query's rows
    if (e.key.length === 1 || e.key === "Backspace") pendingActivate.current = null;
    if (p.mode === "args" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setPicked(true);
      // nothing was highlighted: the first arrow lands on the first row
      if (unmatched && !picked) {
        e.preventDefault();
        return p.setSelected(0);
      }
    }
    const listLength =
      p.mode === "args"
        ? p.argOptions.length
        : p.mode === "pipe"
          ? p.pipeRows.length
          : p.ranked.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      return p.move(1, listLength);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      return p.move(-1, listLength);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      return p.back();
    }

    if (p.mode === "confirm") {
      // typing means you moved on: the approval is dropped, and what you type is a new
      // search, so Enter can never fire a gated run you had already turned away from
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) return p.dropConfirm();
      if (e.key === "Enter" && !p.confirm?.blocked) p.confirmProceed();
      return;
    }

    if (p.mode === "args") {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        // the rows on screen were found for older text: commit once they catch up
        if (!p.argOptionsFresh) {
          pendingCommit.current = true;
          return;
        }
        commitArg();
      }
      return;
    }

    if (p.mode === "pipe") {
      const row = p.pipeRows[p.selected];
      if ((e.key === "Enter" || e.key === "Tab") && row) {
        e.preventDefault();
        p.pick(row.action);
      }
      if (e.key === "Backspace" && p.query === "") {
        e.preventDefault();
        p.back();
      }
      return;
    }

    // browse
    const sel = p.ranked[p.selected];
    if (e.key === "Enter" && sel) {
      e.preventDefault();
      // people found for this query are still on their way: act once they are ranked in,
      // not on the commands that happened to match first ("ada" is Ada, not "Load as")
      if (!p.rankedFresh) {
        pendingActivate.current = { asPage: e.metaKey || e.ctrlKey };
        return;
      }
      return p.activate(sel.node, e.metaKey || e.ctrlKey);
    }
    // Tab pipes a row that stands for a value; on any other row it does nothing,
    // rather than walk focus out of the search box
    if (e.key === "Tab") {
      e.preventDefault();
      if (sel?.node.subject) return p.startPipe(sel.node.subject);
    }
    if (e.key === "ArrowRight" && sel?.node.resolve) {
      e.preventDefault();
      return void p.drill(sel.node);
    }
    if ((e.key === "ArrowLeft" || e.key === "Backspace") && p.query === "" && p.frames.length > 1) {
      e.preventDefault();
      return p.back();
    }
  }

  return {
    listId,
    browseRef,
    argRef,
    onKeyDown,
    activeSpec,
    freeText,
    unmatched,
    picked,
    setPicked,
  };
}

export type PaletteKeys = ReturnType<typeof usePaletteKeys>;
