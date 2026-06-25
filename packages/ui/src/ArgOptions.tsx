import type { ArgOption } from "@command-kernel/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { cn } from "./cn";
import { Icon } from "./icon";

export function ArgOptions({
  options,
  loading,
  selected,
  freeText,
  typed,
  onPick,
  onHover,
}: {
  options: ArgOption[];
  loading: boolean;
  selected: number;
  freeText: boolean;
  typed: string;
  onPick: (value: string) => void;
  onHover: (i: number) => void;
}) {
  return (
    <div className="px-2 pb-2">
      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-white/40">
          <Loader2 size={13} className="animate-spin" /> resolving…
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
          <Icon name={o.icon} size={15} className="text-white/50" />
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
          <CornerDownLeft size={14} className="text-pink-soft" />
          <span className="text-white/70">
            use “<span className="text-white/90">{typed}</span>”
          </span>
        </button>
      )}

      {!loading && options.length === 0 && !typed.trim() && (
        <div className="px-3 py-2 text-[12px] text-white/35">start typing to search…</div>
      )}
    </div>
  );
}
