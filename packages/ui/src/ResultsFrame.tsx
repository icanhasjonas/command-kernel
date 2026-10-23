import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { enter, instant, motionTokens } from "./motion-tokens.js";

/**
 * The palette's body, which never resizes in one frame (Arc): its height follows what is inside
 * on a critically damped spring, so a filter that drops rows closes the gap instead of snapping.
 * A new body (another mode) fades in as the frame moves, one gesture. Reduced motion: it jumps.
 */
export function ResultsFrame({ view, children }: { view: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(Math.round(entry?.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className="overflow-hidden"
      initial={false}
      animate={{ height }}
      transition={reduce ? instant : motionTokens.spring.smooth}
    >
      <div ref={inner}>
        <motion.div
          key={view}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduce ? instant : enter}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}
