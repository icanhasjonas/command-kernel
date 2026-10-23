import { motion, useReducedMotion } from "motion/react";
import { cn } from "./cn.js";
import { enter, instant, motionTokens } from "./motion-tokens.js";

export type PillState = "active" | "filled" | "empty";

/**
 * Arc's badge shape. The accent marks only the arg being filled; a filled arg is neutral (a
 * value is not a success), an empty one is a dashed outline (nothing is wrong with it yet).
 */
export const PILL_LOOK: Record<PillState, string> = {
  active: "border-ck-accent/30 bg-ck-accent-subtle text-ck-accent-strong",
  filled: "border-ck-border bg-ck-surface-muted text-ck-fg",
  empty: "border-dashed border-ck-border-strong text-ck-fg-muted",
};

export const PILL_SHAPE =
  "inline-flex min-h-[26px] max-w-[16rem] items-center gap-1.5 rounded-pill border px-2.5 text-[12px] leading-none font-medium";

export function Pill({
  label,
  value,
  state,
  required,
  requiredLabel = "required",
  optionalLabel = "optional",
}: {
  label: string;
  value?: string;
  state: PillState;
  required?: boolean;
  requiredLabel?: string;
  optionalLabel?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      // a pill that gains a value widens to it on a spring instead of jumping
      layout={reduce ? false : "size"}
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? instant : { default: enter, layout: motionTokens.spring.morph }}
      className={cn(PILL_SHAPE, PILL_LOOK[state])}
    >
      <span className={state === "filled" ? "text-ck-fg-muted" : undefined}>{label}</span>
      {value ? (
        <span className="truncate">{value}</span>
      ) : (
        <span className="font-normal">{required ? requiredLabel : optionalLabel}</span>
      )}
    </motion.span>
  );
}
