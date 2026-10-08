import { Activity } from "lucide-react";
import { TraceRow } from "./TraceRow";
import { traceStore, useTrace } from "./trace-store";

/** The four things the kernel does to every call, in order: the legend for each row's chips. */
const STAGES = [
  ["resolve", "walk the path to the command"],
  ["args", "every required arg present and valid"],
  ["gate", "allowed for this role, approval proven if owed"],
  ["run", "the command's run() fires"],
] as const;

/**
 * The kernel rail: every executing call any driver on this page makes, newest
 * first, with how far it got (resolve, args, gate, run) and what the evidence did.
 * One list for all drivers is the point: they are all calling the same verb.
 */
export function Inspector({ className }: { className?: string }) {
  const trace = useTrace();
  return (
    <section
      aria-label="Kernel trace"
      className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f16] ${className ?? ""}`}
    >
      <header className="flex items-center gap-2 border-white/8 border-b px-4 py-3">
        <Activity size={15} className="text-pink-soft" />
        <h2 className="font-semibold text-[13px] text-white/90">Kernel trace</h2>
        <span className="rounded-full bg-white/[0.06] px-1.5 font-mono text-[11px] text-white/55 tabular-nums">
          {trace.length}
        </span>
        {trace.length > 0 && (
          <button
            type="button"
            onClick={() => traceStore.clear()}
            className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-white/45 hover:bg-white/5 hover:text-white/80"
          >
            Clear
          </button>
        )}
      </header>
      {trace.length === 0 ? (
        <div className="px-5 py-8 text-[13px] leading-relaxed text-white/50">
          <p className="text-white/75">Nothing has run yet.</p>
          <p className="mt-2">
            Every driver on this page calls one kernel instance in your browser; the wire calls the
            server's. Press{" "}
            <kbd className="rounded border border-white/15 px-1 font-mono text-[11px]">⌘K</kbd>,
            click a link, ask the agent: each call shows up here with how far it got and what the
            gate decided.
          </p>
          <dl className="mt-6 space-y-2.5 border-white/8 border-t pt-5 text-[12px]">
            {STAGES.map(([name, what]) => (
              <div key={name} className="flex gap-3">
                <dt className="w-14 shrink-0 font-mono text-white/70">{name}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {trace.map((e) => (
            <TraceRow key={e.id} e={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
