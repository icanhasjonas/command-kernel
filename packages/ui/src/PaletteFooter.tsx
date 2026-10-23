import { cn } from "./cn.js";
import { Kbd } from "./Kbd.js";
import type { PaletteLabels } from "./labels.js";
import type { Mode } from "./palette-types.js";

/** The key hints: a hint names a key that does something here, or it is not shown. */
export function PaletteFooter({
  mode,
  blocked,
  empty,
  drillable,
  pipeable,
  modHeld,
  labels,
}: {
  mode: Mode;
  /** the gate refused: Enter does nothing, so it is not offered */
  blocked: boolean;
  /** browsing, and nothing matches: there is nothing for Enter to select */
  empty: boolean;
  /** the selected row has children (→ drills) */
  drillable: boolean;
  /** the selected row stands for a value (tab pipes it) */
  pipeable: boolean;
  modHeld: boolean;
  labels: PaletteLabels;
}) {
  return (
    // key hints, so none on a touch screen
    <div className="flex h-10 items-center gap-3 border-ck-border-subtle border-t px-4 text-[12px] text-ck-fg-muted max-sm:hidden pointer-coarse:hidden">
      {!(mode === "confirm" && blocked) && !empty && (
        <Hint
          k="↵"
          label={mode === "browse" || mode === "pipe" ? labels.hintSelect : labels.hintConfirm}
        />
      )}
      {/* keyboard-only hints wait for a screen wide enough to have a keyboard */}
      {mode === "browse" && drillable && <Hint k="→" label={labels.hintDrill} keyboardOnly />}
      {mode === "browse" && pipeable && <Hint k="tab" label={labels.hintPipe} />}
      {mode === "browse" && <Hint k="⌘↵" label={labels.hintRunAsPage} keyboardOnly />}
      <Hint k="esc" label={mode === "confirm" ? labels.hintCancel : labels.hintBack} />
      <span
        className={cn(
          "ml-auto hidden items-center gap-1.5 whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none sm:flex",
          modHeld ? "opacity-100" : "opacity-70",
        )}
      >
        {labels.chordHint(<Kbd glow={modHeld}>⌘</Kbd>)}
      </span>
    </div>
  );
}

function Hint({ k, label, keyboardOnly }: { k: string; label: string; keyboardOnly?: boolean }) {
  return (
    <span
      className={cn(
        "items-center gap-1.5 whitespace-nowrap",
        keyboardOnly ? "hidden sm:flex" : "flex",
      )}
    >
      <Kbd>{k}</Kbd> {label}
    </span>
  );
}
