import { Loader2, Unplug } from "lucide-react";
import { useId } from "react";
import { EmptyState } from "./EmptyState.js";
import { ResultList, type RowExtras } from "./ResultList.js";
import type { PipeRow } from "./usePalettePipe.js";

/** Pipe mode's body: every command that takes the value in hand, or why none does. */
export function PipeList({
  rows,
  loading,
  selected,
  modHeld,
  emptyText,
  landsIn,
  extras,
  onPick,
  onHover,
}: {
  rows: PipeRow[];
  loading: boolean;
  selected: number;
  modHeld: boolean;
  emptyText: string;
  landsIn: (arg: string) => string;
  extras: RowExtras;
  onPick: (row: PipeRow) => void;
  onHover: (i: number) => void;
}) {
  const id = useId();
  if (rows.length === 0) {
    return loading ? (
      <EmptyState icon={<Loader2 size={20} strokeWidth={1.75} className="animate-spin" />} />
    ) : (
      <EmptyState icon={<Unplug size={20} strokeWidth={1.75} />} text={emptyText} />
    );
  }
  return (
    <ResultList
      id={id}
      rows={rows}
      selected={selected}
      modHeld={modHeld}
      landsIn={(row) => landsIn(row.action.arg.label)}
      extras={extras}
      onActivate={(row) => onPick(row)}
      onHover={onHover}
    />
  );
}
