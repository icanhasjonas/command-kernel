import type { ArgValues, CommandNode, GateVerdict } from "@command-kernel/core";
import { argText } from "@command-kernel/core";
import { motion } from "framer-motion";
import { Check, ShieldAlert, ShieldX, X } from "lucide-react";
import { Icon } from "./icon.js";
import { Kbd } from "./Kbd.js";
import type { PaletteLabels } from "./labels.js";

export function ConfirmPanel({
  node,
  values,
  verdict,
  blocked,
  role,
  alwaysLabel,
  labels,
  onProceed,
  onAlways,
}: {
  node: CommandNode;
  values: ArgValues;
  verdict: GateVerdict;
  blocked: boolean;
  role: string;
  alwaysLabel: string;
  labels: PaletteLabels;
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
            {blocked ? labels.gateBlocked : labels.gateConfirm}
          </div>
        </div>
      </div>

      {/* what exactly is being approved: the grant will be bound to these values */}
      {Object.keys(values).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(values).map(([k, v]) => (
            <span
              key={k}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[12px]"
            >
              <span className="text-white/45">{k}</span>{" "}
              <span className="text-white/85">{argText(v)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {verdict.checks.map((c, i) => (
          <div
            // a verdict can legitimately carry two checks with the same label
            // biome-ignore lint/suspicious/noArrayIndexKey: positional, list is regenerated whole
            key={i}
            className="flex items-center gap-2 text-[13px]"
          >
            {c.ok ? (
              <Check size={14} className="text-ck-success" />
            ) : (
              <X size={14} className="text-ck-danger" />
            )}
            <span className={c.ok ? "text-white/70" : "text-ck-danger"}>
              {labels.check(c.label, c.ok)}
            </span>
            {!c.ok && (
              <span className="ml-auto text-[12px] text-white/40">{labels.yourRole(role)}</span>
            )}
          </div>
        ))}
        {node.gate?.confirm && (
          <div className="flex items-center gap-2 text-[13px] text-white/70">
            <ShieldAlert size={14} className="text-ck-warning" /> {labels.needsConfirm}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {blocked ? (
          <div className="flex items-center gap-2 text-[12px] text-white/40">
            <Kbd>esc</Kbd> {labels.blockedHint}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onProceed}
              className="rounded-lg bg-pink px-3.5 py-2 text-[13px] font-semibold text-white shadow-ck-glow transition hover:bg-ck-accent-soft"
            >
              {labels.confirmRun}
            </button>
            <button
              type="button"
              onClick={onAlways}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[12px] text-white/70 transition hover:bg-white/[0.08] hover:text-white/90"
            >
              {alwaysLabel}
            </button>
            <span className="flex items-center gap-1.5 text-[12px] text-white/40">
              <Kbd glow>↵</Kbd> {labels.hintConfirm} <Kbd>esc</Kbd> {labels.hintCancel}
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}
