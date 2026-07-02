import { motion } from "framer-motion";
import { cn } from "./cn.js";

export type PillState = "active" | "filled" | "empty";

const VARIANT: Record<PillState, string> = {
  active:
    "border-ck-accent/60 bg-pink/15 text-ck-accent-soft shadow-[0_0_0_1px_rgba(228,19,98,0.35)]",
  filled: "border-ck-success/40 bg-ck-success/10 text-ck-success",
  empty: "border-dashed border-ck-warning/50 bg-ck-warning/[0.06] text-ck-warning/90",
};

export function Pill({
  label,
  value,
  state,
  required,
}: {
  label: string;
  value?: string;
  state: PillState;
  required?: boolean;
}) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.8, y: 2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex max-w-[16rem] items-center gap-1.5 rounded-pill border px-2.5 py-1",
        "font-mono text-[12px] leading-none",
        VARIANT[state],
      )}
    >
      <span className="opacity-60">{label}</span>
      {value ? (
        <span className="truncate font-medium">{value}</span>
      ) : (
        <span className="opacity-50">{required ? "required" : "optional"}</span>
      )}
    </motion.span>
  );
}
