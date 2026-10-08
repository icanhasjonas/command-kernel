import type { ArgOption } from "@command-kernel/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { cn } from "./cn.js";
import { Icon } from "./icon.js";
import type { PaletteLabels } from "./labels.js";

export function ArgOptions({
  options,
  loading,
  selected,
  freeText,
  searchable,
  typed,
  unmatched,
  labels,
  onPick,
  onHover,
}: {
  options: ArgOption[];
  loading: boolean;
  selected: number;
  freeText: boolean;
  /** the arg has options to search (enum, entity, a `complete`), not only a value to write */
  searchable: boolean;
  typed: string;
  /** set when the arg takes only its options and the typed text matches none: why */
  unmatched?: string;
  labels: PaletteLabels;
  onPick: (value: string) => void;
  onHover: (i: number) => void;
}) {
  return (
    <div className="px-2 pb-2">
      {unmatched && (
        <div role="alert" className="px-3 py-2 text-[12px] text-ck-warning">
          {unmatched}
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-white/40">
          <Loader2 size={13} className="animate-spin" /> {labels.resolving}
        </div>
      )}

      {options.map((o, i) => (
        <button
          type="button"
          key={o.value}
          onMouseMove={() => onHover(i)}
          onClick={() => onPick(o.value)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
            i === selected ? "bg-white/[0.07]" : "hover:bg-white/[0.035]",
          )}
        >
          {/* an option without an icon gets none, not a placeholder circle */}
          {o.icon && <Icon name={o.icon} size={15} className="text-white/50" />}
          <span className="flex-1 truncate text-[13px] text-white/85">{o.label}</span>
          {o.hint && <span className="truncate text-[12px] text-white/40">{o.hint}</span>}
        </button>
      ))}

      {freeText && typed.trim() && (
        <button
          type="button"
          onClick={() => onPick(typed)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px]",
            selected < 0 || options.length === 0 ? "bg-white/[0.07]" : "hover:bg-white/[0.035]",
          )}
        >
          <CornerDownLeft size={14} className="text-ck-accent-soft" />
          <span className="text-white/70">{labels.freeTextOption(typed)}</span>
        </button>
      )}

      {!loading && options.length === 0 && !typed.trim() && (
        <div className="px-3 py-2 text-[12px] text-white/35">
          {searchable ? labels.startTyping : labels.typeValue}
        </div>
      )}
    </div>
  );
}
