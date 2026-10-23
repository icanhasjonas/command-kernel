import type { Ctx } from "@command-kernel/core";
import { SearchX } from "lucide-react";
import { ArgOptions } from "./ArgOptions.js";
import { ConfirmPanel } from "./ConfirmPanel.js";
import { EmptyState } from "./EmptyState.js";
import type { PaletteLabels } from "./labels.js";
import { PipeList } from "./PipeList.js";
import { ResultList, type RowExtras } from "./ResultList.js";
import { ResultsFrame } from "./ResultsFrame.js";
import { type PaletteState, subjectLabel } from "./usePalette.js";
import type { PaletteKeys } from "./usePaletteKeys.js";

/** What the palette shows under its input, by mode, in a frame that follows its height. */
export function PaletteBody({
  p,
  keys,
  ctx,
  labels,
  modHeld,
  showWeight,
  extras,
}: {
  p: PaletteState;
  keys: PaletteKeys;
  ctx: Ctx;
  labels: PaletteLabels;
  modHeld: boolean;
  showWeight: boolean;
  extras: RowExtras;
}) {
  const spec = keys.activeSpec;
  const inHand = p.pipe ? subjectLabel(p.pipe.subject) : "";
  return (
    <ResultsFrame view={`${p.mode}:${p.frames.length}`}>
      {p.mode === "confirm" && p.confirm ? (
        <ConfirmPanel
          node={p.confirm.node}
          values={p.confirm.values}
          verdict={p.confirm.verdict}
          blocked={p.confirm.blocked}
          role={ctx.user.role}
          alwaysLabel={p.confirmAlwaysLabel}
          labels={labels}
          onProceed={p.confirmProceed}
          onAlways={p.confirmAlways}
        />
      ) : p.mode === "args" ? (
        <ArgOptions
          options={p.argOptions}
          loading={p.argLoading}
          // nothing highlighted until an unmatched closed arg gets a real pick
          selected={keys.unmatched && !keys.picked ? -1 : p.selected}
          freeText={keys.freeText}
          searchable={!!spec && (spec.kind === "enum" || spec.kind === "entity" || !!spec.complete)}
          typed={p.argQuery}
          {...(keys.unmatched &&
            spec && { unmatched: labels.noOption(spec.label, p.argQuery.trim()) })}
          labels={labels}
          onPick={p.commitArg}
          onHover={p.setSelected}
        />
      ) : p.mode === "pipe" ? (
        <PipeList
          rows={p.pipeRows}
          loading={p.pipeLoading}
          selected={p.selected}
          modHeld={modHeld}
          emptyText={labels.pipeNothing(inHand)}
          landsIn={labels.pipeLandsIn}
          extras={extras}
          onPick={(row) => p.pick(row.action)}
          onHover={p.setSelected}
        />
      ) : p.ranked.length === 0 && p.notes.length === 0 ? (
        <EmptyState
          icon={<SearchX size={20} strokeWidth={1.75} />}
          text={labels.noMatch(p.query)}
        />
      ) : (
        <>
          {p.ranked.length > 0 && (
            <ResultList
              id={keys.listId}
              listbox
              label={labels.searchLabel}
              rows={p.ranked}
              selected={p.selected}
              modHeld={modHeld}
              showWeight={showWeight}
              extras={extras}
              onActivate={(row, exec) => p.activate(row.node, exec)}
              onHover={p.setSelected}
            />
          )}
          {/* where each source's search stands, under the rows (a source with no rows says why) */}
          {p.notes.map((n) => (
            <div key={n.id} className="px-4 pb-3 text-[12px] text-ck-fg-muted">
              {n.note}
            </div>
          ))}
        </>
      )}
    </ResultsFrame>
  );
}
