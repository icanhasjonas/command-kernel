import { motion } from "motion/react";
import { type HTMLAttributes, type ReactNode, useRef } from "react";
import { cn } from "./cn.js";
import { useGlide } from "./useGlide.js";

/**
 * A scrolling list with Arc's gliding highlight behind its active row. The rows paint no
 * selection of their own: one highlight moves between them, so the eye can follow it.
 */
export function GlideList({
  activeId,
  layoutKey,
  className,
  children,
  ...rest
}: {
  /** the DOM id of the active row, or null for none */
  activeId: string | null;
  /** changes whenever the rows do (see useGlide) */
  layoutKey: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const { y, height, opacity } = useGlide(ref, activeId, layoutKey);
  return (
    <div
      ref={ref}
      {...rest}
      className={cn("relative max-h-[min(44vh,360px)] overflow-y-auto px-2 py-1.5", className)}
    >
      <motion.span
        aria-hidden="true"
        data-glide=""
        style={{ y, height, opacity }}
        className="pointer-events-none absolute top-0 right-2 left-2 rounded-lg bg-ck-surface-muted"
      />
      {children}
    </div>
  );
}
