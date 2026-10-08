import { AnimatePresence, motion } from "framer-motion";
import { Activity, X } from "lucide-react";
import { useState } from "react";
import { Inspector } from "./Inspector";
import { useTrace } from "./trace-store";

/** Below the wide layout the rail has no column: a button opens it as a sheet. */
export function MobileTrace() {
  const [open, setOpen] = useState(false);
  const count = useTrace().length;
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-white/15 bg-[#12141c] px-4 py-2.5 text-[13px] text-white shadow-float"
      >
        <Activity size={15} className="text-pink-soft" /> Kernel trace
        <span className="rounded-full bg-white/10 px-1.5 font-mono text-[11px] tabular-nums">
          {count}
        </span>
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
