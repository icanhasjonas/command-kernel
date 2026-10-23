import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { Kbd } from "./Kbd.js";
import type { PaletteLabels } from "./labels.js";
import type { Mode } from "./palette-types.js";

/**
 * The key hints (a hint names a key that does something here, or it is not shown), then the
 * host's own controls. A touch screen has no keys: it shows only the host's controls, if any.
 */
export function PaletteFooter({
  mode,
  blocked,
  empty,
  drillable,
  runnable,
  pipeable,
  chords,
  atRoot,
  modHeld,
  labels,
  host,
}: {
  mode: Mode;
  /** the gate refused: Enter does nothing, so it is not offered */
  blocked: boolean;
  /** browsing, and nothing matches: there is nothing for Enter to select */
  empty: boolean;
  /** the selected row has children (→ drills) */
  drillable: boolean;
  /** the selected row also runs: ⌘↵ runs it where ↵ drills (else ⌘↵ is just ↵, not shown) */
  runnable: boolean;
  /** some command here has a chord: holding ⌘ shows them (else nothing to hold for) */
  chords: boolean;
  /** browsing the root: Esc closes the palette rather than going back */
  atRoot: boolean;
  /** the selected row stands for a value (tab pipes it) */
  pipeable: boolean;
  modHeld: boolean;
  labels: PaletteLabels;
  /** the host's controls (`footer`), at the end */
  host?: ReactNode;
}) {
  // key hints, so none on a touch screen
  const KEYS_ONLY = "max-sm:hidden pointer-coarse:hidden";
  return (
    <div
      className={cn(
        "flex min-h-10 items-center gap-3 border-ck-border-subtle border-t px-4 text-[12px] text-ck-fg-muted",
        !host && KEYS_ONLY,
      )}
    >
      <span className={cn("flex min-w-0 flex-1 items-center gap-3", KEYS_ONLY)}>
        {!(mode === "confirm" && blocked) && !empty && (
          <Hint
            k="↵"
            label={mode === "browse" || mode === "pipe" ? labels.hintSelect : labels.hintConfirm}
          />
        )}
        {/* keyboard-only hints wait for a screen wide enough to have a keyboard */}
        {mode === "browse" && drillable && <Hint k="→" label={labels.hintDrill} keyboardOnly />}
        {mode === "browse" && pipeable && <Hint k="tab" label={labels.hintPipe} />}
        {mode === "browse" && drillable && runnable && (
          <Hint k="⌘↵" label={labels.hintRunAsPage} keyboardOnly />
        )}
        <Hint
          k="esc"
          label={
            mode === "confirm" ? labels.hintCancel : atRoot ? labels.hintClose : labels.hintBack
          }
        />
        {chords && (
          <span
            className={cn(
              "ml-auto hidden items-center gap-1.5 whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none sm:flex",
              modHeld ? "opacity-100" : "opacity-70",
            )}
          >
            {labels.chordHint(<Kbd glow={modHeld}>⌘</Kbd>)}
          </span>
        )}
      </span>
      {host && <span className="ml-auto flex shrink-0 items-center gap-1">{host}</span>}
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
