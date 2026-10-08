import type { Ranked } from "@command-kernel/core";
import { isGated } from "@command-kernel/core";
import { ChevronRight, Lock } from "lucide-react";
import { cn } from "./cn.js";
import { Highlight } from "./Highlight.js";
import { Icon } from "./icon.js";
import { Kbd } from "./Kbd.js";

export function ResultRow({
  id,
  item,
  active,
  modHeld,
  showWeight = false,
  landsIn,
  onActivate,
  onHover,
}: {
  /** set when the row is an option of a listbox the search input controls */
  id?: string;
  item: Ranked;
  active: boolean;
  modHeld: boolean;
  /** authoring diagnostic - off by default; a consumer's users don't want it */
  showWeight?: boolean;
  /** in pipe mode: where the value in hand lands ("as attachments") */
  landsIn?: string;
  onActivate: (exec: boolean) => void;
  onHover: () => void;
}) {
  const { node, positions } = item;
  const gated = isGated(node);
  const drillable = Boolean(node.resolve);
  // a row that stands for a value: Tab pipes it into a command
  const pipeable = Boolean(node.subject);

  return (
    <button
      type="button"
      {...(id !== undefined && {
        id,
        role: "option",
        "aria-selected": active,
        // the input keeps focus and points here with aria-activedescendant
        tabIndex: -1,
      })}
      onMouseMove={onHover}
      onClick={(e) => onActivate(e.metaKey || e.ctrlKey)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.035]",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10",
          active ? "bg-pink/15 text-ck-accent-soft" : "bg-white/[0.04] text-white/60",
        )}
      >
        <Icon name={node.icon} size={17} strokeWidth={2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {node.category && (
            <span className="shrink-0 text-[12px] font-medium text-white/35">
              {node.category} ▸
            </span>
          )}
          <span className="truncate text-[14px] font-medium text-white/90">
            <Highlight text={node.title} positions={positions} />
          </span>
          {gated && <Lock size={12} className="shrink-0 text-ck-danger/90" />}
        </span>
        {node.subtitle && (
          <span className="mt-0.5 block truncate text-[12px] text-white/40">{node.subtitle}</span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {landsIn && (
          <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/60">
            {landsIn}
          </span>
        )}
        {pipeable && !landsIn && (
          <Kbd glow={active} className={cn(!active && "opacity-40")}>
            tab
          </Kbd>
        )}
        {showWeight && typeof node.weight === "number" && node.weight > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-white/25">{node.weight}</span>
        )}
        {node.chord && (
          <Kbd glow={modHeld} className={cn(!modHeld && "opacity-40")}>
            {node.chord.toUpperCase()}
          </Kbd>
        )}
        {/* a routed row runs with the value; there is nothing to drill into from pipe mode */}
        {drillable && !landsIn && (
          <ChevronRight
            size={16}
            className={cn(
              "text-white/25 transition-transform",
              active && "translate-x-0.5 text-white/50",
            )}
          />
        )}
      </span>
    </button>
  );
}
