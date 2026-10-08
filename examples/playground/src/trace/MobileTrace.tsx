import { Icon } from "@command-kernel/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DRIVER_META } from "./drivers";
import { Inspector } from "./Inspector";
import { type Outcome, useTrace } from "./trace-store";

const OUTCOME_TONE: Record<Outcome, string> = {
  ran: "text-teal-soft",
  owed: "text-amber-soft",
  pick: "text-amber-soft",
  args: "text-amber-soft",
  blocked: "text-red-300",
  unresolved: "text-red-300",
  unreached: "text-red-300",
};

/**
 * Below the wide layout the rail has no column: a pill opens it as a sheet, and
 * each new call flashes through the pill (driver, command, outcome) so a call is
 * seen to land without opening anything.
 */
export function MobileTrace() {
  const [open, setOpen] = useState(false);
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
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-white/15 bg-[#12141c] px-4 py-2.5 text-[13px] text-white shadow-float sm:left-auto"
      >
        {live ? (
          <>
            <Icon
              name={DRIVER_META[live.driver].icon}
              size={15}
              className={DRIVER_META[live.driver].tone}
            />
            <span className="min-w-0 truncate font-mono text-[12px]">{live.command}</span>
            <span className={`ml-auto shrink-0 text-[12px] ${OUTCOME_TONE[live.outcome]}`}>
              {live.outcome}
            </span>
          </>
        ) : (
          <>
            <Activity size={15} className="text-pink-soft" /> Kernel trace
            <span className="ml-auto rounded-full bg-white/10 px-1.5 font-mono text-[11px] tabular-nums">
              {trace.length}
            </span>
          </>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col p-3"
          >
            <button
              type="button"
              aria-label="Close the trace"
              onClick={() => setOpen(false)}
              className="mb-2 ml-auto rounded-full bg-[#12141c] p-2 text-white/70"
            >
              <X size={16} />
            </button>
            <Inspector className="min-h-0 flex-1 shadow-float" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
