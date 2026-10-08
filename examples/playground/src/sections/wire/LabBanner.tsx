import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";
import { useLabFlag } from "../../wire/flags";

/**
 * The `beta-banner` flag, made visible: while the lab's server has it on, every
 * connected visitor sees this strip across the top of the page, and it goes for all
 * of them the moment anyone turns the flag off. It lives in the sticky header, so it
 * never covers the page, and it folds away rather than jolting the page by its height.
 */
export function LabBanner() {
  const on = useLabFlag("beta-banner");
  return (
    <AnimatePresence initial={false}>
      {on && (
        <motion.a
          key="banner"
          href="#wire"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="block overflow-hidden border-sky-300/20 border-b bg-sky-300/[0.08] text-center text-[12px] text-sky-100 hover:bg-sky-300/[0.12]"
        >
          <span className="flex items-center justify-center gap-2 px-6 py-1.5">
            <Radio size={12} className="shrink-0 text-sky-300" />
            {/* a phone keeps the strip to one line: the tap still lands on the switch in Wire */}
            <span>
              Beta banner, on for every visitor.{" "}
              <span className="text-sky-100/60 md:hidden">Switch it off in Wire.</span>
              <span className="text-sky-100/60 max-md:hidden">
                A flag on the lab's server: turn it off in Wire and it goes for everyone.
              </span>
            </span>
          </span>
        </motion.a>
      )}
    </AnimatePresence>
  );
}
