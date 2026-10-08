import { Icon } from "@command-kernel/ui";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { DRIVER_META } from "./drivers";
import { OUTCOME_TONE } from "./outcome-tone";
import { useTrace } from "./trace-store";

/**
 * Below the wide layout the rail has no column: this button in the header opens it as
 * a sheet, and each new call flashes through it (driver, command, outcome) so a call
 * is seen to land without opening anything. It lives in the sticky header, so it
 * never sits on the page's own buttons.
 */
export function TracePill({ onOpen }: { onOpen: () => void }) {
  const trace = useTrace();
  const latest = trace[0];
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    if (!latest) return;
    setFlash(latest.id);
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [latest]);

  const live = latest && flash === latest.id ? latest : null;
  // one size always: a call lands as a flash of its driver and outcome colour, so the
  // button never grows over the section links beside it
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Kernel trace, ${trace.length} calls${live ? `, latest ${live.command} ${live.outcome}` : ""}`}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white hover:bg-white/[0.08] lg:hidden"
    >
      {live ? (
        <Icon
          name={DRIVER_META[live.driver].icon}
          size={13}
          className={DRIVER_META[live.driver].tone}
        />
      ) : (
        <Activity size={13} className="text-pink-soft" />
      )}
      Trace
      <span
        className={`rounded-full bg-white/10 px-1.5 font-mono text-[11px] tabular-nums ${live ? OUTCOME_TONE[live.outcome] : ""}`}
      >
        {trace.length}
      </span>
    </button>
  );
}
