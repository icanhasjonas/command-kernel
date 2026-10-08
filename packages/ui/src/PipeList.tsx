import { Loader2, Unplug } from "lucide-react";
import { ResultRow } from "./ResultRow.js";
import type { PipeRow } from "./usePalettePipe.js";

/** Pipe mode's body: every command that takes the value in hand, or why none does. */
export function PipeList({
  rows,
  loading,
  selected,
  modHeld,
  emptyText,
  landsIn,
  onPick,
  onHover,
}: {
  rows: PipeRow[];
  loading: boolean;
  selected: number;
  modHeld: boolean;
  emptyText: string;
  landsIn: (arg: string) => string;
  onPick: (row: PipeRow) => void;
  onHover: (i: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-10 text-white/35">
        {loading ? <Loader2 size={20} className="animate-spin" /> : <Unplug size={22} />}
        {!loading && <span className="text-[13px]">{emptyText}</span>}
      </div>
    );
  }
  return (
    <div className="max-h-[44vh] overflow-y-auto px-2 py-2">
      {rows.map((row, i) => (
        <ResultRow
          key={row.node.id}
          item={row}
          active={i === selected}
          modHeld={modHeld}
          landsIn={landsIn(row.action.arg.label)}
          onActivate={() => onPick(row)}
          onHover={() => onHover(i)}
        />
      ))}
    </div>
  );
}
