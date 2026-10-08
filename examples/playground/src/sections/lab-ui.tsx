import { cn } from "@command-kernel/ui";
import type { ReactNode } from "react";

/** The labs' shared parts: a numbered step, a quiet button, and the log of what each try got. */

export interface Attempt {
  label: string;
  /**
   * what came of it: ran, still owed, refused by the gate, short of args, a note (no
   * call), or stopped before any kernel saw it (the network, a rate limit)
   */
  answer: "ran" | "owed" | "blocked" | "args" | "note" | "unreached";
  detail: string;
}

/** Flip one hex digit: the smallest possible forgery. */
export const tamper = (sig: string) => `${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`;

export const btn =
  "rounded-lg border border-white/12 px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35";

const TONE: Record<Attempt["answer"], string> = {
  ran: "text-teal-soft",
  owed: "text-amber-soft",
  blocked: "text-red-300",
  args: "text-amber-soft",
  note: "text-white/55",
  unreached: "text-red-300",
};

export function Step({
  n,
  label,
  done,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
          done ? "border-teal-soft/50 bg-teal/25 text-teal-soft" : "border-white/15 text-white/50",
        )}
      >
        {n}
      </span>
      <span className="w-20 shrink-0 text-[13px] text-white/70">{label}</span>
      {children}
    </li>
  );
}

export function AttemptLog({ attempts }: { attempts: Attempt[] }) {
  return (
    <ul className="space-y-2" aria-live="polite">
      {attempts.map((a, i) => (
        // attempts are a short, newest-first log with no stable id of their own
        // biome-ignore lint/suspicious/noArrayIndexKey: positional log
        <li key={i} className="text-[13px]">
          <span className="text-white/80">{a.label}</span>{" "}
          <span className={TONE[a.answer]}>→ {a.answer}</span>
          {a.detail && <span className="text-white/45"> · {a.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
