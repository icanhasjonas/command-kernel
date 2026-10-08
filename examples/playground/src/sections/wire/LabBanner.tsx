import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";

/**
 * The `beta-banner` flag, made visible: while the lab's server has it on, every
 * connected visitor sees this, and it leaves for all of them the moment anyone turns
 * the flag off. Fixed over the page, so it never shifts what is under it.
 */
export function LabBanner({ on }: { on: boolean }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="pointer-events-none fixed inset-x-0 top-[60px] z-20 flex justify-center px-4"
        >
          <a
            href="#wire"
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-sky-300/30 bg-[#0d1420]/95 px-3.5 py-1.5 text-[12px] text-sky-100 shadow-lg backdrop-blur hover:border-sky-300/60"
          >
            <Radio size={13} className="text-sky-300" />
            <span>
              <span className="font-mono">beta-banner</span> is on, on the server: everyone sees
              this. Turn it off in Wire
            </span>
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
