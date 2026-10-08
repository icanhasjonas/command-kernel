import { Kbd } from "@command-kernel/ui";
import { AnimatePresence, motion } from "framer-motion";
import { useDemo } from "./demo/demo-context";
import { kernel } from "./demo/kernel";

/**
 * After ⌘J the keyboard waits for a second key. Without this nothing on screen says
 * so: it lists the keys that finish a chord, and goes when one does or time runs out.
 */
export function ChordHint({ armed }: { armed: boolean }) {
  const { ctx } = useDemo();
  const chords = armed ? [...kernel.chords(ctx)] : [];
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center px-4"
    >
      <AnimatePresence>
        {armed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/12 bg-[#12141c]/95 px-4 py-2.5 text-[13px] text-white/70 shadow-float backdrop-blur-xl"
          >
            <span className="flex items-center gap-1.5 text-white/90">
              <Kbd glow>⌘J</Kbd> then
            </span>
            {chords.map(([key, node]) => (
              <span key={key} className="flex items-center gap-1.5">
                <Kbd>{key.toUpperCase()}</Kbd> {node.title}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
