import type { CommandNode, Ctx, Kernel } from "@command-kernel/core";
import { hopArgs, resolveChildren } from "@command-kernel/core";
import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { type Frame, framesKey } from "./palette-key.js";
import type { Mode } from "./palette-types.js";

interface FramesHookArgs {
  kernel: Kernel;
  ctx: Ctx;
  roots: CommandNode[];
  /** shared with `usePaletteArgs`: one "latest request wins" counter across both */
  token: RefObject<number>;
}

/**
 * The browse stack: the frame chain, the search query and its ranked results,
 * and drilling into a node's children. Owns `mode` too, because the
 * re-resolve effect below only runs in browse mode, and every other flow
 * needs to read or clear it.
 */
export function usePaletteFrames({ kernel, ctx, roots, token }: FramesHookArgs) {
  const [frames, setFrames] = useState<Frame[]>([
    { node: null, items: roots, dynamic: false, args: {} },
  ]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>("browse");
  const [resolving, setResolving] = useState(false);

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
  }, [query, mode, frame.dynamic, frame.node, frame.positionalArgId, ctx, token]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, ranked.length - 1)));
  }, [ranked.length]);

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

  // the chain of ancestor frames = the prior path a tip grant binds against
  const ancestorKey = useCallback(() => framesKey(frames), [frames]);

  const move = useCallback((delta: number, length: number) => {
    setSelected((s) => (length === 0 ? 0 : (s + delta + length) % length));
  }, []);

  return {
    frames,
    setFrames,
    frame,
    ranked,
    query,
    setQuery,
    selected,
    setSelected,
    move,
    mode,
    setMode,
    resolving,
    drill,
    ancestorKey,
  };
}
