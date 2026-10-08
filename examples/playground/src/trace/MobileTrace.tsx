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
  mistyped: "text-red-300",
  denied: "text-white/55",
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

  // a sheet closes the way sheets do: Escape, or a tap outside it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // while the visitor types (the agent's goal, a palette arg) the pill steps aside
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.matches("input, textarea") || t.isContentEditable);
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  const live = latest && flash === latest.id ? latest : null;
  return (
    <div className={typing && !open ? "hidden" : "lg:hidden"}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // a corner pill, not a bar: it must not sit on the inputs it scrolls past
        className="fixed right-4 bottom-4 z-40 flex max-w-[min(320px,calc(100vw-2rem))] items-center gap-2 rounded-full border border-white/15 bg-[#12141c] px-4 py-2.5 text-[13px] text-white shadow-float"
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
          <>
            <motion.button
              type="button"
              aria-label="Close the trace"
              tabIndex={-1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/60"
            />
            <motion.div
              role="dialog"
              aria-label="Kernel trace"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-50 flex h-[70vh] flex-col rounded-t-2xl border-white/10 border-t bg-[#0a0b10] px-3 pt-2 pb-3"
            >
              {/* handle centred, close at the end, both inside the sheet's own top edge */}
              <div className="grid grid-cols-[32px_1fr_32px] items-center px-1 pb-1">
                <span />
                <span className="mx-auto h-1 w-10 rounded-full bg-white/20" />
                <button
                  type="button"
                  aria-label="Close the trace"
                  onClick={() => setOpen(false)}
                  className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/5 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <Inspector className="min-h-0 flex-1" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
