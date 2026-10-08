import { argText } from "@command-kernel/core";
import { cn, Icon } from "@command-kernel/ui";
import { motion } from "framer-motion";
import { DRIVER_META } from "./drivers";
import type { Outcome, TraceEntry } from "./trace-store";

type Mark = "ok" | "fail" | "wait" | "off";

/** The four things the kernel does to every call, in order, and how far this one got. */
function stages(o: Outcome): [string, Mark][] {
  const reached: Record<Outcome, Mark[]> = {
    unresolved: ["fail", "off", "off", "off"],
    args: ["ok", "fail", "off", "off"],
    pick: ["ok", "wait", "off", "off"],
    blocked: ["ok", "ok", "fail", "off"],
    owed: ["ok", "ok", "wait", "off"],
    ran: ["ok", "ok", "ok", "ok"],
    unreached: ["off", "off", "off", "off"],
  };
  const names = ["resolve", "args", "gate", "run"];
  return names.map((n, i) => [n, reached[o][i] ?? "off"]);
}

const MARK: Record<Mark, string> = {
  ok: "border-teal-soft/40 bg-teal/25 text-teal-soft",
  fail: "border-danger/50 bg-danger/15 text-red-300",
  wait: "border-amber-soft/50 bg-amber-soft/15 text-amber-soft",
  off: "border-white/10 text-white/25",
};

const VERDICT: Record<Outcome, string> = {
  unresolved: "no such command",
  args: "needs args",
  pick: "which one?",
  blocked: "blocked by the gate",
  owed: "approval owed",
  ran: "ran",
  unreached: "never reached a kernel",
};

/** A failed role check names what the command REQUIRES, never what the caller is. */
const failedCheck = (label: string) => (label.startsWith("role: ") ? `needs ${label}` : label);

const GRANT: Record<TraceEntry["grant"], string> = {
  none: "",
  verified: "grant verified",
  refused: "grant refused",
  policy: "always-allow rule",
};

export function TraceRow({ e }: { e: TraceEntry }) {
  const d = DRIVER_META[e.driver];
  const args = Object.entries(e.args);
  const failed = e.checks.find((c) => !c.ok);
  const time = new Date(e.at).toLocaleTimeString([], { hour12: false });
  return (
    <motion.li
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-white/6 border-b px-4 py-3 last:border-b-0"
    >
      <div className="flex items-center gap-2 text-[11px]">
        <Icon name={d.icon} size={13} className={d.tone} />
        <span className={cn("font-medium", d.tone)}>{d.label}</span>
        <span className="ml-auto font-mono text-white/40 tabular-nums">{time}</span>
      </div>
      <div className="mt-1.5 truncate font-mono text-[12px] text-white/90">{e.command}</div>
      {(args.length > 0 || e.input) && (
        <div className="mt-1 space-y-0.5 font-mono text-[11px] text-white/55">
          {e.input && (
            <div className="truncate">
              <span className="text-teal-soft">piped</span>{" "}
              {e.input.label ?? argText(e.input.value)}
            </div>
          )}
          {args.map(([k, v]) => (
            <div key={k} className="truncate">
              {k}=<span className="text-white/75">{argText(v)}</span>
            </div>
          ))}
        </div>
      )}
      <ol className="mt-2 flex flex-wrap items-center gap-1" aria-label={VERDICT[e.outcome]}>
        {stages(e.outcome).map(([name, mark]) => (
          <li
            key={name}
            className={cn("rounded border px-1.5 py-px font-mono text-[10px]", MARK[mark])}
          >
            {name}
          </li>
        ))}
        <li className="ml-1 text-[11px] text-white/60">{VERDICT[e.outcome]}</li>
      </ol>
      {(failed || e.problems.length > 0) && (
        <div className="mt-1.5 text-[11px] text-red-300/90">
          {failed ? failedCheck(failed.label) : e.problems.join(" · ")}
        </div>
      )}
      {e.grant !== "none" && (
        <div
          className={cn(
            "mt-1.5 font-mono text-[11px]",
            e.grant === "refused" ? "text-red-300/90" : "text-amber-soft/90",
          )}
        >
          {GRANT[e.grant]}
          {e.sig && <span className="text-white/45"> · sig {e.sig}</span>}
        </div>
      )}
      {e.message && <div className="mt-1.5 text-[12px] text-white/70">{e.message}</div>}
    </motion.li>
  );
}
