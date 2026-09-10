import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Kbd({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] px-1.5",
        "border border-ck-kbd-border bg-ck-kbd-bg font-mono text-[11px] font-medium text-ck-kbd-fg",
        "shadow-(--shadow-ck-kbd)",
        glow && "border-ck-accent/50 bg-ck-accent/15 text-ck-accent-soft",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
