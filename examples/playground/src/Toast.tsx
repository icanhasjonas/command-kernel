import { cn } from "@command-kernel/ui";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useDemo } from "./demo/demo-context";

/**
 * The last thing said, once, then gone, just under the header (clear of the inputs and
 * the trace pill at the bottom). A command's result shows only below the wide layout,
 * where the rail is out of sight; anything else ("New session") shows on every screen.
 */
export function Toast() {
  const { toast, palette } = useDemo();
  const [shown, setShown] = useState<number | null>(null);

  // the palette opening is the next thing happening: an older note gives way to it
  useEffect(() => {
    if (palette.open) setShown(null);
  }, [palette.open]);

  // each new toast shows for a few seconds; a click dismisses it early
  useEffect(() => {
    if (!toast) return;
    setShown(toast.id);
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-[calc(var(--header-h)+12px)] z-[60] flex justify-center px-4",
        toast?.inRail && "lg:hidden",
      )}
    >
      <AnimatePresence>
        {toast && shown === toast.id && (
          <motion.button
            type="button"
            key={toast.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={() => setShown(null)}
            className={cn(
              "pointer-events-auto max-w-[min(560px,92vw)] rounded-xl border px-4 py-2.5 text-left text-[13px] shadow-float backdrop-blur-xl",
              toast.tone === "nav" && "border-sky-300/30 bg-sky-950/85 text-sky-100",
              toast.tone === "ok" && "border-teal-soft/30 bg-[#0c2422]/90 text-teal-50",
              toast.tone === "warn" && "border-amber-soft/40 bg-[#2a1d08]/90 text-amber-100",
            )}
          >
            {toast.msg}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
