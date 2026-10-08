import type {
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  Grant,
  Kernel,
  Piped,
} from "@command-kernel/core";
import { missingArgs, outputOf, ruleForNode } from "@command-kernel/core";
import { useCallback, useState } from "react";
import type { ArgSession, ConfirmSession, Mode, RunStart } from "./palette-types.js";

interface GateHookArgs {
  ctx: Ctx;
  kernel: Kernel;
  ancestorKey: () => string;
  drill: (node: CommandNode) => Promise<void>;
  setMode: (mode: Mode) => void;
  setSelected: (selected: number) => void;
  setArg: (session: ArgSession | null) => void;
  setArgQuery: (query: string) => void;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
  onClose: () => void;
  /** a run produced a value the next command can take: carry on with it instead of closing */
  onOutput: (value: Piped, from: CommandNode) => void;
}

/** What `proceedGate` needs besides the node and its args. */
export interface Proceed {
  grant?: Grant;
  /** the grant's binding context; absent = the browse frames */
  priorKey?: string;
}

const keyed = (priorKey?: string) => (priorKey !== undefined ? { priorKey } : {});

/**
 * The gate + confirm flow: running a node through `kernel.executeNode`,
 * collecting missing args along the way, and the two ways a human can clear
 * a blocked verdict (confirm once, or mint a standing "always allow" rule).
 */
export function usePaletteGate({
  ctx,
  kernel,
  ancestorKey,
  drill,
  setMode,
  setSelected,
  setArg,
  setArgQuery,
  onResult,
  onExecuted,
  onClose,
  onOutput,
}: GateHookArgs) {
  const [confirm, setConfirm] = useState<ConfirmSession | null>(null);

  const finish = useCallback(
    (node: CommandNode, result: CommandResult | null) => {
      onExecuted(node.id);
      if (result) onResult(result);
      // a command that hands something on keeps the palette open on what it made
      const out = result && node.output ? outputOf(node, result) : null;
      if (out && typeof out !== "string") {
        setConfirm(null);
        return onOutput(out, node);
      }
      onClose();
    },
    [onExecuted, onResult, onClose, onOutput],
  );

  const proceedGate = useCallback(
    async (node: CommandNode, values: ArgValues, opts: Proceed = {}) => {
      const outcome = await kernel.executeNode(node, values, ctx, {
        ...(opts.grant !== undefined && { grant: opts.grant }),
        priorKey: opts.priorKey ?? ancestorKey(),
      });
      // the kernel refused on completeness, not permission - collect the args
      // instead of showing the human a lock they can do nothing about
      if (outcome.missing.length > 0) {
        setMode("args");
        setArg({ node, values, activeArg: outcome.missing[0] as string, ...keyed(opts.priorKey) });
        setArgQuery("");
        setSelected(0);
        return;
      }
      // the same for a value the schema refused: back to that arg, saying why, with
      // the bad value cleared for a new one (the gate never even looked)
      const bad = outcome.argErrors[0];
      if (bad) {
        const { [bad.argId]: _refused, ...kept } = values;
        setMode("args");
        setArg({
          node,
          values: kept,
          activeArg: bad.argId,
          error: bad.message,
          ...keyed(opts.priorKey),
        });
        setArgQuery("");
        setSelected(0);
        return;
      }
      if (!outcome.verdict.allowed || outcome.awaitingConfirm) {
        setMode("confirm");
        setConfirm({
          node,
          values,
          verdict: outcome.verdict,
          blocked: !outcome.verdict.allowed,
          ...keyed(opts.priorKey),
        });
        return;
      }
      finish(node, outcome.result);
    },
    [ctx, finish, ancestorKey, kernel, setMode, setArg, setArgQuery, setSelected],
  );

  // human clicked Confirm - mint a grant bound to this exact command+args+path
  const confirmProceed = useCallback(() => {
    if (!confirm) return;
    // the kernel's one mint: canonical args, this path, and this principal
    const principal = kernel.principalOf(ctx);
    const grant = kernel.grantFor({
      node: confirm.node,
      args: confirm.values,
      priorKey: confirm.priorKey ?? ancestorKey(),
      ...(principal !== undefined && { principal }),
    });
    void proceedGate(confirm.node, confirm.values, { grant, ...keyed(confirm.priorKey) });
  }, [confirm, ancestorKey, proceedGate, kernel, ctx]);

  // human clicked Always allow - record the standing rule, then run (no grant;
  // the policy now auto-satisfies the gate and won't ask again this session)
  const confirmAlways = useCallback(() => {
    if (!confirm) return;
    kernel.policy.allow(ruleForNode(confirm.node, confirm.values));
    void proceedGate(confirm.node, confirm.values, keyed(confirm.priorKey));
  }, [confirm, proceedGate, kernel]);

  const beginExecute = useCallback(
    (node: CommandNode, start: RunStart = {}) => {
      const values = { ...(node.prefill ? node.prefill(ctx) : {}), ...start.values };
      // ANY missing required arg is collected, positional included - the kernel
      // refuses to run without them, so skipping the prompt just dead-ends.
      const missing = missingArgs(node, values);
      if (missing.length > 0) {
        setMode("args");
        setArg({ node, values, activeArg: missing[0] as string, ...keyed(start.priorKey) });
        setArgQuery("");
        setSelected(0);
        return;
      }
      void proceedGate(node, values, keyed(start.priorKey));
    },
    [ctx, proceedGate, setMode, setArg, setArgQuery, setSelected],
  );

  const activate = useCallback(
    (node: CommandNode, exec: boolean) => {
      if (exec) {
        if (node.run || node.args?.length) return beginExecute(node);
        if (node.resolve) return void drill(node);
        return;
      }
      if (node.resolve) return void drill(node);
      if (node.run || node.args?.length) return beginExecute(node);
    },
    [beginExecute, drill],
  );

  return {
    confirm,
    setConfirm,
    proceedGate,
    confirmProceed,
    confirmAlways,
    beginExecute,
    activate,
    finish,
  };
}
