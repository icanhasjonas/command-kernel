import type {
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  Grant,
  Kernel,
} from "@command-kernel/core";
import { missingArgs, ruleForNode } from "@command-kernel/core";
import { useCallback, useState } from "react";
import type { ArgSession, ConfirmSession, Mode } from "./palette-types.js";

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
}

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
}: GateHookArgs) {
  const [confirm, setConfirm] = useState<ConfirmSession | null>(null);

  const finish = useCallback(
    (node: CommandNode, result: CommandResult | null) => {
      onExecuted(node.id);
      if (result) onResult(result);
      onClose();
    },
    [onExecuted, onResult, onClose],
  );

  const proceedGate = useCallback(
    async (node: CommandNode, values: ArgValues, grant?: Grant) => {
      const outcome = await kernel.executeNode(node, values, ctx, {
        ...(grant !== undefined && { grant }),
        priorKey: ancestorKey(),
      });
      // the kernel refused on completeness, not permission — collect the args
      // instead of showing the human a lock they can do nothing about
      if (outcome.missing.length > 0) {
        setMode("args");
        setArg({ node, values, activeArg: outcome.missing[0] as string });
        setArgQuery("");
        setSelected(0);
        return;
      }
      if (!outcome.verdict.allowed) {
        setMode("confirm");
        setConfirm({ node, values, verdict: outcome.verdict, blocked: true });
        return;
      }
      if (outcome.awaitingConfirm) {
        setMode("confirm");
        setConfirm({ node, values, verdict: outcome.verdict, blocked: false });
        return;
      }
      finish(node, outcome.result);
    },
    [ctx, finish, ancestorKey, kernel, setMode, setArg, setArgQuery, setSelected],
  );

  // human clicked Confirm — mint a grant bound to this exact command+args+path
  const confirmProceed = useCallback(() => {
    if (!confirm) return;
    // the kernel's one mint: canonical args, this path, and this principal
    const principal = kernel.principalOf(ctx);
    const grant = kernel.grantFor({
      node: confirm.node,
      args: confirm.values,
      priorKey: ancestorKey(),
      ...(principal !== undefined && { principal }),
    });
    void proceedGate(confirm.node, confirm.values, grant);
  }, [confirm, ancestorKey, proceedGate, kernel, ctx]);

  // human clicked Always allow — record the standing rule, then run (no grant;
  // the policy now auto-satisfies the gate and won't ask again this session)
  const confirmAlways = useCallback(() => {
    if (!confirm) return;
    kernel.policy.allow(ruleForNode(confirm.node, confirm.values));
    void proceedGate(confirm.node, confirm.values);
  }, [confirm, proceedGate, kernel]);

  const beginExecute = useCallback(
    (node: CommandNode) => {
      const values = node.prefill ? node.prefill(ctx) : {};
      // ANY missing required arg is collected, positional included — the kernel
      // refuses to run without them, so skipping the prompt just dead-ends.
      const missing = missingArgs(node, values);
      if (missing.length > 0) {
        setMode("args");
        setArg({ node, values, activeArg: missing[0] as string });
        setArgQuery("");
        setSelected(0);
        return;
      }
      void proceedGate(node, values);
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
