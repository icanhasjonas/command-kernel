import type {
  ArgOption,
  ArgValues,
  CommandNode,
  CommandResult,
  Ctx,
  GateVerdict,
  Grant,
  Kernel,
} from "@command-kernel/core";
import {
  allowLabel,
  argList,
  entityOption,
  hopArgs,
  missingArgs,
  resolveChildren,
  ruleForNode,
} from "@command-kernel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Frame, framesKey } from "./palette-key.js";

export type Mode = "browse" | "args" | "confirm";

interface ArgSession {
  node: CommandNode;
  values: ArgValues;
  activeArg: string;
}

interface ConfirmSession {
  node: CommandNode;
  values: ArgValues;
  verdict: GateVerdict;
  blocked: boolean;
}

interface Hooks {
  kernel: Kernel;
  ctx: Ctx;
  roots: CommandNode[];
  open: boolean;
  trigger?: { id: string; nonce: number } | null | undefined;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
  onClose: () => void;
}

export function usePalette({
  kernel,
  ctx,
  roots,
  open,
  trigger,
  onResult,
  onExecuted,
  onClose,
}: Hooks) {
  const [frames, setFrames] = useState<Frame[]>([
    { node: null, items: roots, dynamic: false, args: {} },
  ]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>("browse");
  const [resolving, setResolving] = useState(false);
  const [arg, setArg] = useState<ArgSession | null>(null);
  const [argQuery, setArgQuery] = useState("");
  const [argOptions, setArgOptions] = useState<ArgOption[]>([]);
  const [argLoading, setArgLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSession | null>(null);
  const token = useRef(0);

  const frame = frames[frames.length - 1] as Frame;

  const ranked = useMemo(() => {
    if (frame.dynamic)
      return frame.items.map((node) => ({ node, score: 0, positions: [] as number[] }));
    return kernel.search(frame.items, query, ctx);
  }, [frame, query, ctx, kernel]);

  // live re-resolve for dynamic (search) frames as the query changes
  useEffect(() => {
    if (mode !== "browse" || !frame.dynamic || !frame.node || !frame.positionalArgId) return;
    const node = frame.node;
    const argId = frame.positionalArgId;
    const mine = ++token.current;
    const t = setTimeout(() => {
      setResolving(true);
      // resolve (and so key) the hop with exactly what command() would: prefill + query
      const args = hopArgs(node, { [argId]: query }, ctx);
      resolveChildren(node, args, ctx).then((items) => {
        if (mine !== token.current) return;
        setFrames((f) => {
          const copy = f.slice();
          copy[copy.length - 1] = { ...(copy[copy.length - 1] as Frame), items, args };
          return copy;
        });
        setResolving(false);
      });
    }, 110);
    return () => clearTimeout(t);
  }, [query, mode, frame.dynamic, frame.node, frame.positionalArgId, ctx]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, ranked.length - 1)));
  }, [ranked.length]);

  // arg-scoped value completion
  useEffect(() => {
    if (mode !== "args" || !arg) return;
    const spec = arg.node.args?.find((a) => a.id === arg.activeArg);
    if (!spec) return setArgOptions([]);
    if (spec.enumValues) {
      const q = argQuery.toLowerCase();
      return setArgOptions(spec.enumValues.filter((o) => o.label.toLowerCase().includes(q)));
    }
    // entity-typed arg: the registered entity catalog is the completion source
    if (spec.entity && kernel.entities) {
      const mine = ++token.current;
      setArgLoading(true);
      kernel.entities
        .search(
          spec.entity.type,
          argQuery,
          ctx,
          spec.entity.constraint !== undefined ? { constraint: spec.entity.constraint } : undefined,
        )
        .then((found) => {
          if (mine !== token.current) return;
          setArgOptions(found.map(entityOption));
          setArgLoading(false);
        });
      return;
    }
    if (!spec.complete) return setArgOptions([]);
    const mine = ++token.current;
    setArgLoading(true);
    spec.complete(argQuery, ctx).then((opts) => {
      if (mine !== token.current) return;
      setArgOptions(opts);
      setArgLoading(false);
    });
  }, [mode, arg, argQuery, ctx, kernel]);

  const drill = useCallback(
    async (node: CommandNode) => {
      if (!node.resolve) return;
      const pos = node.args?.find((a) => a.positional);
      setResolving(true);
      // the args resolve() receives are the ones the frame is keyed by (core hopArgs)
      const args = hopArgs(node, pos ? { [pos.id]: "" } : {}, ctx);
      const items = await resolveChildren(node, args, ctx);
      setFrames((f) => [
        ...f,
        {
          node,
          items,
          args,
          dynamic: Boolean(pos),
          ...(pos?.id !== undefined && { positionalArgId: pos.id }),
        },
      ]);
      setQuery("");
      setSelected(0);
      setResolving(false);
    },
    [ctx],
  );

  const finish = useCallback(
    (node: CommandNode, result: CommandResult | null) => {
      onExecuted(node.id);
      if (result) onResult(result);
      onClose();
    },
    [onExecuted, onResult, onClose],
  );

  // the chain of ancestor frames = the prior path a tip grant binds against
  const ancestorKey = useCallback(() => framesKey(frames), [frames]);

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
    [ctx, finish, ancestorKey, kernel],
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
    [ctx, proceedGate],
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

  const back = useCallback(() => {
    if (mode === "args" || mode === "confirm") {
      setMode("browse");
      setArg(null);
      setConfirm(null);
      return;
    }
    if (frames.length > 1) {
      setFrames((f) => f.slice(0, -1));
      setQuery("");
      setSelected(0);
      return;
    }
    onClose();
  }, [mode, frames.length, onClose]);

  const advanceOrRun = useCallback(
    (session: ArgSession) => {
      const remaining = missingArgs(session.node, session.values).filter(
        (id) => id !== session.activeArg,
      );
      if (remaining.length > 0) {
        setArg({ ...session, activeArg: remaining[0] as string });
        setArgQuery("");
        setSelected(0);
        return;
      }
      setMode("browse");
      setArg(null);
      void proceedGate(session.node, session.values);
    },
    [proceedGate],
  );

  // commit a value for the active arg. A `multiple` arg ACCUMULATES and stays put
  // (call finishArg to move on); a single arg advances to the next missing one.
  const commitArg = useCallback(
    (value: string) => {
      if (!arg) return;
      const spec = arg.node.args?.find((a) => a.id === arg.activeArg);
      if (spec?.multiple) {
        const next = [...argList(arg.values[arg.activeArg]), value];
        setArg({ ...arg, values: { ...arg.values, [arg.activeArg]: next } });
        setArgQuery("");
        setSelected(0);
        return;
      }
      advanceOrRun({ ...arg, values: { ...arg.values, [arg.activeArg]: value } });
    },
    [arg, advanceOrRun],
  );

  // done adding to a `multiple` arg -> advance to the next missing arg (or run)
  const finishArg = useCallback(() => {
    if (arg) advanceOrRun(arg);
  }, [arg, advanceOrRun]);

  const move = useCallback((delta: number, length: number) => {
    setSelected((s) => (length === 0 ? 0 : (s + delta + length) % length));
  }, []);

  // reset to root whenever the palette opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: open-edge reset only
  useEffect(() => {
    if (!open) return;
    setFrames([{ node: null, items: roots, dynamic: false, args: {} }]);
    setQuery("");
    setSelected(0);
    setMode("browse");
    setArg(null);
    setConfirm(null);
  }, [open]);

  // chord leader: jump straight into a command's execute/drill flow
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire on nonce only
  useEffect(() => {
    if (!trigger) return;
    const node = roots.find((n) => n.id === trigger.id);
    if (node) activate(node, false);
  }, [trigger?.nonce]);

  return {
    frames,
    frame,
    ranked,
    query,
    setQuery,
    selected,
    setSelected,
    move,
    mode,
    resolving,
    arg,
    argQuery,
    setArgQuery,
    argOptions,
    argLoading,
    confirm,
    confirmAlwaysLabel: confirm ? allowLabel(ruleForNode(confirm.node, confirm.values)) : "",
    activate,
    back,
    commitArg,
    finishArg,
    confirmProceed,
    confirmAlways,
    drill,
  };
}
