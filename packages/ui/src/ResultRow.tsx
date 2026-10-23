import type { Ranked } from "@command-kernel/core";
import { isGated } from "@command-kernel/core";
import { ChevronRight, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { Highlight } from "./Highlight.js";
import { Icon } from "./icon.js";
import { Kbd } from "./Kbd.js";

/** a key a touch screen has no use for: hidden without a fine pointer or a wide screen */
const KEYS_ONLY = "max-sm:hidden pointer-coarse:hidden";

/** Arc's result row: one line, the shared highlight behind it (GlideList), no fill of its own. */
export const ROW =
  "group relative flex min-h-[34px] w-full items-center gap-2.5 rounded-lg px-2 text-left outline-none pointer-coarse:min-h-11";

export function ResultRow({
  id,
  option = false,
  item,
  active,
  modHeld,
  showWeight = false,
  landsIn,
  disabledReason,
  adornment,
  onActivate,
  onHover,
}: {
  /** the row's DOM id: the highlight finds it by this */
  id?: string;
  /** the row is an option of a listbox the search input controls */
  option?: boolean;
  item: Ranked;
  active: boolean;
  modHeld: boolean;
  /** authoring diagnostic - off by default; a consumer's users don't want it */
  showWeight?: boolean;
  /** in pipe mode: where the value in hand lands ("as attachments") */
  landsIn?: string;
  /** why the node cannot run right now (core `disabledReason`): the row says it, greyed */
  disabledReason?: string | null;
  /** whatever the host draws at the row's end (`rowAdornment`) */
  adornment?: ReactNode;
  onActivate: (exec: boolean) => void;
  onHover: () => void;
}) {
  const { node, positions } = item;
  const gated = isGated(node);
  const drillable = Boolean(node.resolve);
  // a row that stands for a value: Tab pipes it into a command
  const pipeable = Boolean(node.subject);
  const off = disabledReason !== undefined && disabledReason !== null;

  return (
    <button
      type="button"
      id={id}
      {...(option && {
        role: "option",
        "aria-selected": active,
        // the input keeps focus and points here with aria-activedescendant
        tabIndex: -1,
      })}
      {...(off && { "aria-disabled": true })}
      onMouseMove={onHover}
      // a press never takes focus from the search box: it stays where the keys go, and a row
      // that goes away after it ran ("Load more") cannot drop focus on the page
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => onActivate(e.metaKey || e.ctrlKey)}
      className={cn(ROW, "cursor-pointer")}
    >
      <Icon
        name={node.icon}
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
        className={cn(
          "shrink-0 transition-colors duration-150 motion-reduce:transition-none",
          active && !off ? "text-ck-fg" : "text-ck-fg-muted",
        )}
      />

      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className={cn(
            "max-w-full shrink-0 truncate text-[14px] font-medium",
            off ? "text-ck-fg-muted" : "text-ck-fg",
          )}
        >
          <Highlight text={node.title} positions={positions} />
        </span>
        {node.subtitle && (
          <span className="min-w-0 truncate text-[12px] text-ck-fg-muted max-sm:hidden">
            {node.subtitle}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-2 text-[12px] text-ck-fg-muted">
        {off && disabledReason && <span className="max-w-[14rem] truncate">{disabledReason}</span>}
        {adornment}
        {gated && (
          // who the gate declares it for, said before any arg is asked: the node's own data,
          // not a verdict (the kernel still decides, after the args)
          <span className="flex items-center gap-1 max-sm:hidden">
            <Lock size={12} strokeWidth={1.75} aria-hidden="true" />
            {node.gate?.roles && node.gate.roles.length > 0 && node.gate.roles.join(" / ")}
          </span>
        )}
        {landsIn && (
          <span className="rounded-pill border border-ck-border px-2 py-0.5 text-[11px] font-medium text-ck-fg-secondary max-sm:hidden">
            {landsIn}
          </span>
        )}
        {pipeable && !landsIn && (
          <Kbd glow={active} className={cn(KEYS_ONLY, !active && "opacity-50")}>
            tab
          </Kbd>
        )}
        {showWeight && typeof node.weight === "number" && node.weight > 0 && (
          <span className="tabular-nums">{node.weight}</span>
        )}
        {node.chord && (
          <Kbd glow={modHeld} className={cn(KEYS_ONLY, !modHeld && "opacity-60")}>
            {node.chord.toUpperCase()}
          </Kbd>
        )}
        {/* a routed row runs with the value; there is nothing to drill into from pipe mode */}
        {drillable && !landsIn && (
          <ChevronRight
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className={cn(
              "transition-[transform,color] duration-150 motion-reduce:transition-none",
              active ? "translate-x-0.5 text-ck-fg" : "text-ck-fg-muted",
            )}
          />
        )}
      </span>
    </button>
  );
}
