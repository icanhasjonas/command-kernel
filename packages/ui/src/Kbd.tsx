import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * A keycap, Arc's flat one: a hairline, a muted fill, the body face at 500. `glow` marks a key
 * that is live right now (the mod key held for chords): it takes the accent, nothing else does.
 */
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
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[6px] px-1.5",
        "border border-ck-kbd-border bg-ck-kbd-bg [font-family:inherit] text-[11px] leading-none font-medium text-ck-kbd-fg tabular-nums",
        "shadow-(--shadow-ck-kbd) transition-colors duration-150 ease-(--ease-ck-standard) motion-reduce:transition-none",
        glow && "border-transparent bg-ck-accent-subtle text-ck-accent-strong",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
