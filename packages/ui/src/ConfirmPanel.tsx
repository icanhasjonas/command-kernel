import type { ArgValues, CommandNode, GateVerdict } from "@command-kernel/core";
import { argText } from "@command-kernel/core";
import { Check, ShieldAlert, ShieldX, X } from "lucide-react";
import { Icon } from "./icon.js";
import { Kbd } from "./Kbd.js";
import type { PaletteLabels } from "./labels.js";
import { PILL_LOOK, PILL_SHAPE } from "./Pill.js";

/** Arc's buttons, at control height sm: the primary one is the accent, the other a hairline. */
const BUTTON =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-ck-control px-4 text-[14px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ck-accent/70 motion-reduce:transition-none motion-reduce:active:scale-100 max-sm:w-full";

export function ConfirmPanel({
  node,
  values,
  verdict,
  blocked,
  role,
  alwaysLabel,
  labels,
  unavailable = false,
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
  /**
   * The command says it cannot run now (core `disabled`): the reason is the app's, not a
   * role's, so it is said as it is, with no role against it.
   */
  unavailable?: boolean;
  onProceed: () => void;
  onAlways: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-4">
      <div className="flex items-start gap-3">
        {/* the shield carries the status: amber asks, red refuses */}
        <span className={blocked ? "mt-0.5 text-ck-danger" : "mt-0.5 text-ck-warning"}>
          {blocked ? (
            <ShieldX size={20} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ShieldAlert size={20} strokeWidth={1.75} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-medium text-ck-fg">
            <Icon
              name={node.icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="text-ck-fg-muted"
            />
            <span className="truncate">{node.title}</span>
          </div>
          <div className="text-[12px] text-ck-fg-secondary">
            {blocked ? labels.gateBlocked : labels.gateConfirm}
          </div>
        </div>
      </div>

      {/* what exactly is being approved: the grant will be bound to these values */}
      {Object.keys(values).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(values).map(([k, v]) => (
            <span key={k} className={`${PILL_SHAPE} ${PILL_LOOK.filled}`}>
              <span className="text-ck-fg-muted">{k}</span>
              <span className="truncate">{argText(v)}</span>
            </span>
          ))}
        </div>
      )}

      {/* a refusal is said at once, not only seen */}
      <ul className="flex flex-col gap-1.5" {...(blocked && { role: "alert" })}>
        {verdict.checks.map((c, i) => (
          <li
            // a verdict can legitimately carry two checks with the same label
            // biome-ignore lint/suspicious/noArrayIndexKey: positional, list is regenerated whole
            key={i}
            className="flex items-center gap-2 text-[14px]"
          >
            {c.ok ? (
              <Check size={16} strokeWidth={1.75} aria-hidden="true" className="text-ck-success" />
            ) : (
              <X size={16} strokeWidth={1.75} aria-hidden="true" className="text-ck-danger" />
            )}
            <span className={c.ok ? "text-ck-fg-secondary" : "text-ck-danger"}>
              {unavailable ? c.label : labels.check(c.label, c.ok)}
            </span>
            {!c.ok && !unavailable && (
              <span className="ml-auto text-[12px] text-ck-fg-muted">{labels.yourRole(role)}</span>
            )}
          </li>
        ))}
        {node.gate?.confirm && (
          <li className="flex items-center gap-2 text-[14px] text-ck-fg-secondary">
            <ShieldAlert
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="text-ck-warning"
            />
            {labels.needsConfirm}
          </li>
        )}
      </ul>

      {/* narrow screens stack the two choices full width */}
      <div className="flex flex-wrap items-center gap-2">
        {blocked ? (
          <div className="flex items-center gap-2 text-[12px] text-ck-fg-muted">
            <Kbd className="pointer-coarse:hidden">esc</Kbd>{" "}
            {unavailable ? labels.unavailableHint : labels.blockedHint}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onProceed}
              className={`${BUTTON} bg-ck-accent text-ck-accent-fg hover:bg-ck-accent-strong`}
            >
              {labels.confirmRun}
            </button>
            <button
              type="button"
              onClick={onAlways}
              className={`${BUTTON} border border-ck-border bg-ck-surface text-ck-fg hover:bg-ck-surface-muted max-sm:truncate`}
            >
              {alwaysLabel}
            </button>
            {/* the keys (↵ confirm, esc cancel) are in the footer, said once */}
          </>
        )}
      </div>
    </div>
  );
}
