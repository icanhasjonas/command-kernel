import type { ArgValues, CommandNode, CommandResponse } from "@command-kernel/core";
import { allowLabel, argText, ruleForNode } from "@command-kernel/core";
import { Icon } from "@command-kernel/ui";
import { Check, ShieldAlert, ShieldX } from "lucide-react";
import { needs } from "../../trace/needs";

export type CallStatus = "owed" | "blocked" | "done" | "denied";

export interface Call {
  id: number;
  node: CommandNode;
  values: ArgValues;
  status: CallStatus;
  /** the kernel's gate answer: the only thing a grant may be minted from */
  gate?: Extract<CommandResponse, { kind: "gate" }>;
  /** the agent tried a made-up grant, and the kernel refused it */
  forged?: boolean;
  /** what the run said, kept on the call that made it */
  result?: string;
}

/** One tool call the agent made, and, when the gate wants a human, the operator's choices. */
export function CallCard({
  call,
  onAllow,
  onAlways,
  onForge,
  onDeny,
}: {
  call: Call;
  onAllow: () => void;
  onAlways: () => void;
  onForge: () => void;
  onDeny: () => void;
}) {
  const { node, values, status } = call;
  const failed = call.gate?.verdict.checks.find((c) => !c.ok);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
      <div className="flex items-center gap-2 text-[12px] text-white/50">
        <Icon name={node.icon} size={13} className="text-violet-300" /> tool call
      </div>
      <pre className="mt-1.5 font-mono text-[12px] leading-relaxed text-white/80">
        {`${node.id}(`}
        {Object.entries(values).map(([k, v]) => `\n  ${k}: "${argText(v)}"`)}
        {"\n)"}
      </pre>
      <div className="mt-3 border-white/8 border-t pt-3">
        {status === "owed" && (
          <div className="space-y-2.5">
            {call.forged && (
              <div className="flex items-center gap-1.5 text-[12px] text-red-300">
                <ShieldX size={13} /> The agent's forged grant was refused. Only your Allow runs
                this.
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[12px] text-amber-soft">
              <ShieldAlert size={13} /> The gate wants your approval:{" "}
              {node.gate?.reason ?? "confirm"}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAllow}
                className="rounded-md bg-pink px-3 py-1.5 font-semibold text-[12px] text-white hover:bg-pink-soft"
              >
                Allow once
              </button>
              <button
                type="button"
                onClick={onAlways}
                className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.06]"
              >
                {allowLabel(ruleForNode(node, values))}
              </button>
              <button
                type="button"
                onClick={onDeny}
                className="rounded-md px-3 py-1.5 text-[12px] text-white/55 hover:bg-white/5"
              >
                Deny
              </button>
            </div>
            {!call.forged && (
              <button
                type="button"
                onClick={onForge}
                className="text-[12px] text-white/45 underline decoration-dotted underline-offset-4 hover:text-white/75"
              >
                Let the agent forge a grant instead
              </button>
            )}
          </div>
        )}
        {status === "blocked" && (
          <div className="flex items-center gap-1.5 text-[12px] text-red-300">
            <ShieldX size={13} /> The gate refused: {failed ? needs(failed.label) : "not permitted"}
          </div>
        )}
        {status === "done" && (
          <div className="flex items-start gap-1.5 text-[12px] text-teal-soft">
            <Check size={13} className="mt-0.5 shrink-0" /> Ran
            {call.result && <span className="text-white/70">· {call.result}</span>}
          </div>
        )}
        {status === "denied" && (
          <div className="text-[12px] text-white/45">Denied by you: nothing ran</div>
        )}
      </div>
    </div>
  );
}
