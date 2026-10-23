import { ChevronLeft } from "lucide-react";
import { PaletteCrumbs } from "./PaletteCrumbs.js";

/** Where you are (the crumbs, with a back button once there is a way back) and as whom. */
export function PaletteHeader({
  crumbs,
  canGoBack,
  backLabel,
  context,
  onBack,
}: {
  crumbs: string[];
  canGoBack: boolean;
  backLabel: string;
  /** where the palette was opened and as whom, in the host's words ("" for nothing) */
  context: string;
  onBack: () => void;
}) {
  return (
    <div className="flex h-10 items-center justify-between gap-3 px-4 pt-1 text-[12px]">
      <div className="flex min-w-0 items-center gap-1">
        {/* Esc's twin for a touch screen, which has no Esc: one step back */}
        {canGoBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-1.5 grid size-6 shrink-0 place-items-center rounded-[7px] text-ck-fg-muted transition-colors duration-150 hover:bg-ck-surface-muted hover:text-ck-fg active:bg-ck-surface-muted focus-visible:outline-2 focus-visible:outline-ck-accent/70 motion-reduce:transition-none pointer-coarse:size-9"
          >
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        <PaletteCrumbs items={crumbs} />
      </div>
      {context && <span className="shrink-0 truncate text-ck-fg-muted">{context}</span>}
    </div>
  );
}
