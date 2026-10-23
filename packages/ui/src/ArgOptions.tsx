import type { ArgOption } from "@command-kernel/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { useId } from "react";
import { cn } from "./cn.js";
import { GlideList } from "./GlideList.js";
import { Icon } from "./icon.js";
import type { PaletteLabels } from "./labels.js";
import { ROW } from "./ResultRow.js";

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
  const id = useId();
  const free = freeText && typed.trim() !== "";
  // the typed value is the choice when no option is highlighted, or there are none
  const freeActive = free && (selected < 0 || options.length === 0);
  const activeId = freeActive ? `${id}-free` : options[selected] ? `${id}-${selected}` : null;
  return (
    <GlideList activeId={activeId} layoutKey={`${options.map((o) => o.value).join("\n")}|${free}`}>
      {unmatched && (
        <div role="alert" className="px-2 py-2 text-[12px] text-ck-warning">
          {unmatched}
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 px-2 py-2 text-[12px] text-ck-fg-muted">
          <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> {labels.resolving}
        </div>
      )}

      {options.map((o, i) => (
        <button
          type="button"
          key={o.value}
          id={`${id}-${i}`}
          onMouseMove={() => onHover(i)}
          // the arg's input keeps focus (ResultRow)
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(o.value)}
          className={cn(ROW, "cursor-pointer")}
        >
          {/* an option without an icon gets none, not a placeholder circle */}
          {o.icon && (
            <Icon
              name={o.icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className={i === selected ? "text-ck-fg" : "text-ck-fg-muted"}
            />
          )}
          <span className="flex-1 truncate text-[14px] font-medium text-ck-fg">{o.label}</span>
          {o.hint && <span className="truncate text-[12px] text-ck-fg-muted">{o.hint}</span>}
        </button>
      ))}

      {free && (
        <button
          type="button"
          id={`${id}-free`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(typed)}
          className={cn(
            ROW,
            "cursor-pointer text-[14px]",
            !freeActive && "transition-colors hover:bg-ck-surface-muted/60",
          )}
        >
          <CornerDownLeft
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className={freeActive ? "text-ck-fg" : "text-ck-fg-muted"}
          />
          <span className="text-ck-fg-secondary">{labels.freeTextOption(typed)}</span>
        </button>
      )}

      {!loading && options.length === 0 && !typed.trim() && (
        <div className="px-2 py-2 text-[12px] text-ck-fg-muted">
          {searchable ? labels.startTyping : labels.typeValue}
        </div>
      )}
    </GlideList>
  );
}
