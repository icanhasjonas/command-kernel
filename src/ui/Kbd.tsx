import type { ReactNode } from "react";
import { cn } from "../lib/cn";

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
        "border border-white/10 bg-white/5 font-mono text-[11px] font-medium text-white/70",
        "shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]",
        glow && "border-pink/50 bg-pink/15 text-pink-soft",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
