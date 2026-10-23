import { Loader2, Search, Workflow } from "lucide-react";
import { ArgBar } from "./ArgBar.js";
import { cn } from "./cn.js";
import type { PaletteLabels } from "./labels.js";
import { PILL_LOOK, PILL_SHAPE } from "./Pill.js";
import { type PaletteState, subjectLabel } from "./usePalette.js";
import type { PaletteKeys } from "./usePaletteKeys.js";

/**
 * The palette's input line: the search box (with the value in hand, when piping), or in args
 * mode the command and its arg pills, the active pill being the input.
 */
export function PaletteQuery({
  p,
  keys,
  labels,
}: {
  p: PaletteState;
  keys: PaletteKeys;
  labels: PaletteLabels;
}) {
  // the input is a combobox over the result list, expanded while it shows one
  const browsing = p.mode === "browse";
  const listed = browsing && p.ranked.length > 0;
  const typed = browsing && p.query.trim() !== "";
  // the value being piped, named, while the list shows what can take it
  const inHand = p.mode === "pipe" && p.pipe ? subjectLabel(p.pipe.subject) : "";

  return (
    <div className="border-ck-border-subtle border-b px-4">
      {p.mode === "args" && p.arg ? (
        <ArgBar
          arg={p.arg}
          query={p.argQuery}
          inputRef={keys.argRef}
          labels={labels}
          onQuery={(q) => {
            p.setArgQuery(q);
            p.setSelected(0);
            keys.setPicked(false);
          }}
        />
      ) : (
        <div className="flex min-h-[52px] items-center gap-2.5">
          {inHand ? (
            <span className={cn(PILL_SHAPE, PILL_LOOK.active, "max-w-[14rem] shrink-0")}>
              <Workflow size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{inHand}</span>
            </span>
          ) : (
            <Search
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
              className="shrink-0 text-ck-fg-muted"
            />
          )}
          <input
            ref={keys.browseRef}
            value={p.query}
            onChange={(e) => {
              // new text, however it arrived (keys, paste, IME): the confirm on
              // screen is dropped, so Enter cannot approve what you moved past
              if (p.mode === "confirm") p.dropConfirm();
              p.setQuery(e.target.value);
              p.setSelected(0);
            }}
            aria-label={inHand ? labels.pipeInto(inHand) : labels.searchLabel}
            {...(browsing && {
              role: "combobox",
              "aria-expanded": listed,
              "aria-autocomplete": "list" as const,
            })}
            {...(listed && {
              "aria-controls": keys.listId,
              "aria-activedescendant": `${keys.listId}-${p.selected}`,
            })}
            autoComplete="off"
            spellCheck={false}
            placeholder={inHand ? labels.pipePlaceholder : labels.placeholder}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ck-fg outline-none placeholder:text-ck-fg-muted"
          />
          {p.resolving && (
            <Loader2
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="animate-spin text-ck-fg-muted"
            />
          )}
          {/* the chip is visual; this says the same to a screen reader */}
          <span role="status" aria-live="polite" className="sr-only">
            {inHand && !p.pipeLoading
              ? labels.pipeCount(inHand, p.pipeRows.length)
              : typed
                ? labels.resultCount(p.ranked.length)
                : ""}
          </span>
        </div>
      )}
    </div>
  );
}
