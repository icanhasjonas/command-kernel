import type { CommandNode, GateVerdict } from "@command-kernel/core";
import { motion } from "framer-motion";
import { Check, ShieldAlert, ShieldX, X } from "lucide-react";
import { Icon } from "./icon";
import { Kbd } from "./Kbd";

export function ConfirmPanel({
  node,
  verdict,
  blocked,
  role,
  alwaysLabel,
  onProceed,
  onAlways,
}: {
  node: CommandNode;
  verdict: GateVerdict;
  blocked: boolean;
  role: string;
  alwaysLabel: string;
  onProceed: () => void;
  onAlways: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-3 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg border border-danger/40 bg-danger/10 text-ck-danger">
          {blocked ? <ShieldX size={18} /> : <ShieldAlert size={18} />}
        </span>
        <div>
          <div className="flex items-center gap-2 text-[14px] font-medium text-white/90">
            <Icon name={node.icon} size={14} /> {node.title}
          </div>
          <div className="text-[12px] text-white/40">
            {blocked ? "You can't run this here" : "This command is gated — confirm to continue"}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {verdict.checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-[13px]">
            {c.ok ? (
              <Check size={14} className="text-ck-success" />
            ) : (
              <X size={14} className="text-ck-danger" />
            )}
            <span className={c.ok ? "text-white/70" : "text-ck-danger"}>requires {c.label}</span>
            {!c.ok && <span className="ml-auto text-[12px] text-white/40">you: {role}</span>}
          </div>
        ))}
        {node.gate?.confirm && (
          <div className="flex items-center gap-2 text-[13px] text-white/70">
            <ShieldAlert size={14} className="text-ck-warning" /> requires explicit confirm
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {blocked ? (
          <div className="flex items-center gap-2 text-[12px] text-white/40">
            <Kbd>esc</Kbd> back — escalate to an admin to proceed
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onProceed}
              className="rounded-lg bg-pink px-3.5 py-2 text-[13px] font-semibold text-white shadow-ck-glow transition hover:bg-ck-accent-soft"
            >
              Confirm & run
            </button>
            <button
              type="button"
              onClick={onAlways}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[12px] text-white/70 transition hover:bg-white/[0.08] hover:text-white/90"
            >
              {alwaysLabel}
            </button>
            <span className="flex items-center gap-1.5 text-[12px] text-white/40">
              <Kbd glow>↵</Kbd> confirm <Kbd>esc</Kbd> cancel
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}
