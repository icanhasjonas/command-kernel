import type { CommandNode, Ranked } from "@command-kernel/core";
import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { GlideList } from "./GlideList.js";
import { rowGroups } from "./group-rows.js";
import { ResultRow } from "./ResultRow.js";

export interface RowExtras {
  /** core `disabledReason` for this node under the palette's ctx */
  disabledReason: (node: CommandNode) => string | null;
  /** the host's row adornment, if it passed one */
  adornment?: ((node: CommandNode, state: { active: boolean }) => ReactNode) | undefined;
}

/**
 * The ranked rows, under their category headings (Arc's grouped results). The rows were
 * grouped before they reached here (usePalette), so the index the keyboard moves is the
 * order they are drawn in. `listbox` makes it the list a combobox input controls.
 */
export function ResultList<T extends Ranked>({
  id,
  listbox = false,
  label,
  rows,
  selected,
  modHeld,
  showWeight,
  landsIn,
  extras,
  onActivate,
  onHover,
}: {
  id: string;
  listbox?: boolean;
  label?: string;
  rows: readonly T[];
  selected: number;
  modHeld: boolean;
  showWeight?: boolean;
  landsIn?: (row: T) => string;
  extras: RowExtras;
  onActivate: (row: T, exec: boolean) => void;
  onHover: (i: number) => void;
}) {
  const groups = rowGroups(rows);
  // one group needs no heading: the crumbs already say where you are
  const headed = groups.length > 1;
  return (
    <GlideList
      id={id}
      {...(listbox && { role: "listbox", "aria-label": label })}
      activeId={rows[selected] ? `${id}-${selected}` : null}
      layoutKey={rows.map((r) => r.node.id).join("\n")}
    >
      {groups.map((g, gi) => (
        <div
          key={`${g.label ?? ""}:${g.start}`}
          {...(listbox &&
            headed &&
            g.label !== undefined && { role: "group", "aria-label": g.label })}
          // a group without a heading, after another group, is set off by a hairline
          className={cn(
            gi > 0 && "mt-1.5",
            gi > 0 && !g.label && "border-ck-border-subtle border-t pt-1.5",
          )}
        >
          {headed && g.label && (
            <div
              aria-hidden="true"
              className="px-2 pt-1.5 pb-1 text-[12px] font-medium text-ck-fg-muted"
            >
              {g.label}
            </div>
          )}
          {g.rows.map((row, j) => {
            const i = g.start + j;
            return (
              <ResultRow
                key={row.node.id}
                id={`${id}-${i}`}
                option={listbox}
                item={row}
                active={i === selected}
                modHeld={modHeld}
                {...(showWeight !== undefined && { showWeight })}
                {...(landsIn && { landsIn: landsIn(row) })}
                disabledReason={extras.disabledReason(row.node)}
                adornment={extras.adornment?.(row.node, { active: i === selected })}
                onActivate={(exec) => onActivate(row, exec)}
                onHover={() => onHover(i)}
              />
            );
          })}
        </div>
      ))}
    </GlideList>
  );
}
