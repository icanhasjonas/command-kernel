import type { ReactNode } from "react";

/** One chapter of the demo: a numbered heading, a lede that says what to try, then the live thing. */
export function Section({
  id,
  index,
  title,
  lede,
  children,
}: {
  id: string;
  index: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 pt-20">
      <div className="font-mono text-[12px] text-pink-soft">{index}</div>
      <h2 id={`${id}-title`} className="mt-2 font-semibold text-[26px] text-white tracking-tight">
        {title}
      </h2>
      <div className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-white/60">{lede}</div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** A bordered surface for one live demo inside a section. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // min-w-0: as a grid item it must be able to shrink below its longest URL or code line
    <div
      className={`min-w-0 rounded-xl border border-white/10 bg-white/[0.025] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** Inline code in prose. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-white/[0.06] px-1 py-px font-mono text-[0.88em] text-white/85">
      {children}
    </code>
  );
}
