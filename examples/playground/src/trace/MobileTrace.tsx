import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { Inspector } from "./Inspector";

/**
 * Below the wide layout the rail has no column: the header's trace button (TracePill)
 * opens it as this bottom sheet. It sits outside the header, whose backdrop blur would
 * otherwise pin a fixed sheet to the header's own box.
 */
export function MobileTrace({ open, onClose }: { open: boolean; onClose: () => void }) {
  // a sheet closes the way sheets do: Escape, or a tap outside it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden">
          <motion.button
            type="button"
            aria-label="Close the trace"
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <Inspector className="min-h-0 flex-1" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
