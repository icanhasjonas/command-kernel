import type { CommandResult, PipeResponse } from "@command-kernel/core";
import { argText } from "@command-kernel/core";
import { cn } from "@command-kernel/ui";
import { ArrowRight, Play } from "lucide-react";
import { useState } from "react";
import { useDemo } from "../../demo/demo-context";
import { drivers } from "../../demo/kernel";
import { traceStore } from "../../trace/trace-store";
import type { PipePreset } from "./presets";

type StepState =
  | { kind: "idle" }
  | { kind: "ok"; result: CommandResult }
  | { kind: "stop"; why: string };

const preview = (r: CommandResult) =>
  r.value === undefined
    ? r.message
    : argText(r.value).slice(0, 42) + (argText(r.value).length > 42 ? "…" : "");

/** One pipe, drawn as the value and the steps it flows through; Run hands it to `kernel.pipe`. */
export function PipeRun({ preset }: { preset: PipePreset }) {
  const { getCtx, ran } = useDemo();
  const [states, setStates] = useState<StepState[]>(preset.steps.map(() => ({ kind: "idle" })));
  const [answer, setAnswer] = useState<PipeResponse | null>(null);

  async function run() {
    setStates(preset.steps.map(() => ({ kind: "idle" })));
    const res = await drivers.pipe.pipe(
      { input: preset.from, steps: preset.steps.map((s) => s.step) },
      getCtx(),
    );
    setAnswer(res);
    // reveal the steps one at a time, so the value is seen to travel
    for (const [i, r] of res.results.entries()) {
      await new Promise((ok) => setTimeout(ok, 220));
      setStates((xs) => xs.map((x, j) => (j === i ? { kind: "ok", result: r } : x)));
      ran(preset.steps[i]?.step.path.at(-1)?.id ?? "");
    }
    // refused by the type check before any step ran: no call reached the kernel, so
    // the pipe itself says so in the rail (a step that ran is already there)
    if (res.kind === "broken" && res.results.length === 0) {
      const step = preset.steps[res.step];
      traceStore.record({
        driver: "pipe",
        command: step?.step.path.at(-1)?.id ?? "(pipe)",
        title: step?.label ?? "",
        args: {},
        input: preset.from,
        outcome: "args",
        checks: [],
        problems: [res.reason],
        grant: "none",
      });
    }
    if (res.kind === "broken" || res.kind === "paused") {
      const why = res.kind === "broken" ? res.reason : `paused: ${res.response.kind}`;
      setStates((xs) => xs.map((x, j) => (j === res.step ? { kind: "stop", why } : x)));
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="rounded-pill border border-teal-soft/40 bg-teal/15 px-2.5 py-1 font-mono text-[12px] text-teal-soft">
            {preset.from.label}
            <span className="text-teal-soft/60"> : {preset.from.type.entity?.type}</span>
          </span>
          {preset.steps.map((s, i) => {
            const st = states[i] ?? { kind: "idle" };
            return (
              <span key={s.label} className="flex items-center gap-2">
                <ArrowRight size={14} className="text-white/30" />
                <span
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[13px] transition-colors",
                    st.kind === "ok" && "border-teal-soft/40 text-white",
                    st.kind === "stop" && "border-danger/60 text-red-200",
                    st.kind === "idle" && "border-white/12 text-white/70",
                  )}
                >
                  {s.label}
                </span>
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => void run()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-teal/60 px-3 py-1.5 text-[13px] text-white hover:bg-teal"
        >
          <Play size={13} /> Run
        </button>
      </div>
      <p className="mt-2.5 text-[12px] text-white/50">{preset.expect}</p>
      {answer && (
        <ol className="mt-3 space-y-1 border-white/8 border-t pt-3 font-mono text-[12px]">
          {states.map((st, i) =>
            st.kind === "idle" ? null : (
              <li
                key={preset.steps[i]?.label}
                className={st.kind === "stop" ? "text-red-300" : "text-white/65"}
              >
                {i + 1}. {st.kind === "ok" ? preview(st.result) : st.why}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
