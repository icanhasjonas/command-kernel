import type { Ctx, Kernel, NodeDescriptor, PathSegment } from "@command-kernel/core";
import { ChevronRight, CornerDownLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * DRIVER #3 — the scout. It renders EXACTLY what an agent sees when it walks the
 * tree via command(): the self-describing taxonomy. Every row shows the node's
 * summary + machine-readable badges (scout-free vs needs-query, read-only vs
 * writes, gate, args). Free branches drill on click (safe context-building);
 * query branches demand a search term first; writing leaves are shown but run
 * from chat. No guessing — the tree describes itself.
 */
export function Scout({ kernel, ctx }: { kernel: Kernel; ctx: Ctx }) {
  const [path, setPath] = useState<PathSegment[]>([]);
  const [items, setItems] = useState<NodeDescriptor[]>([]);
  const [crumbs, setCrumbs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryFor, setQueryFor] = useState<string | null>(null);
  const [term, setTerm] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    kernel.command({ path, query: "" }, ctx).then((r) => {
      if (!live) return;
      setItems(
        r.kind === "completions"
          ? r.items.flatMap((i) => (i.kind === "command" ? [i.descriptor] : []))
          : [],
      );
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [path, ctx, kernel]);

  function drillFree(d: NodeDescriptor) {
    setPath((p) => [...p, { id: d.id }]);
    setCrumbs((c) => [...c, d.title]);
    setQueryFor(null);
  }

  function drillQuery(d: NodeDescriptor) {
    const pos = d.args.find((a) => a.positional);
    if (!pos) return;
    setPath((p) => [...p, { id: d.id, args: { [pos.id]: term } }]);
    setCrumbs((c) => [...c, `${d.title} “${term}”`]);
    setQueryFor(null);
    setTerm("");
  }

  function up(to: number) {
    setPath((p) => p.slice(0, to));
    setCrumbs((c) => c.slice(0, to));
    setQueryFor(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-white/5 border-b px-4 py-2 text-[12px] text-white/45">
        <button
          type="button"
          onClick={() => up(0)}
          className={path.length ? "hover:text-white/80" : "text-white/80"}
        >
          root
        </button>
        {crumbs.map((c, i) => (
          <span key={crumbs.slice(0, i + 1).join("/")} className="flex items-center gap-1.5">
            <ChevronRight size={11} className="text-white/20" />
            <button
              type="button"
              onClick={() => up(i + 1)}
              className={i === crumbs.length - 1 ? "text-white/80" : "hover:text-white/80"}
            >
              {c}
            </button>
          </span>
        ))}
        {loading && <Loader2 size={12} className="ml-auto animate-spin" />}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {items.length === 0 && !loading && (
          <div className="px-2 py-6 text-center text-[12px] text-white/30">nothing here</div>
        )}
        {items.map((d) => (
          <ScoutRow
            key={d.id}
            d={d}
            expanded={queryFor === d.id}
            term={term}
            onTerm={setTerm}
            onDrillFree={() => drillFree(d)}
            onOpenQuery={() => {
              setQueryFor(d.id);
              setTerm("");
            }}
            onDrillQuery={() => drillQuery(d)}
          />
        ))}
      </div>
    </div>
  );
}

function ScoutRow({
  d,
  expanded,
  term,
  onTerm,
  onDrillFree,
  onOpenQuery,
  onDrillQuery,
}: {
  d: NodeDescriptor;
  expanded: boolean;
  term: string;
  onTerm: (v: string) => void;
  onDrillFree: () => void;
  onOpenQuery: () => void;
  onDrillQuery: () => void;
}) {
  const canDrill = d.navigable;
  const onClick = !canDrill ? undefined : d.enumerate === "free" ? onDrillFree : onOpenQuery;
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <button
        type="button"
        onClick={onClick}
        disabled={!canDrill}
        className="flex w-full items-start gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-white/85">{d.id}</span>
            {canDrill && <ChevronRight size={13} className="text-white/30" />}
          </div>
          {d.summary && <div className="mt-1 text-[12px] text-white/45">{d.summary}</div>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {d.navigable && (
              <Badge tone={d.enumerate === "free" ? "ok" : "warn"}>
                {d.enumerate === "free" ? "scout-free" : "needs query"}
              </Badge>
            )}
            {d.executable && (
              <Badge tone={d.effect === "writes" ? "danger" : "muted"}>
                {d.effect === "writes" ? "writes" : "read-only"}
              </Badge>
            )}
            {d.gate?.roles && <Badge tone="danger">{d.gate.roles.join("/")}</Badge>}
            {d.gate?.confirm && <Badge tone="warn">confirm</Badge>}
            {d.args.map((a) => (
              <Badge key={a.id} tone="arg">
                {a.id}:{a.kind}
                {a.required ? "*" : ""}
              </Badge>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 flex items-center gap-2">
          <input
            // biome-ignore lint/a11y/noAutofocus: focus the query field the user just opened
            autoFocus
            value={term}
            onChange={(e) => onTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onDrillQuery()}
            placeholder="search term…"
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/90 outline-none placeholder:text-white/30 focus:border-pink/40"
          />
          <button
            type="button"
            onClick={onDrillQuery}
            className="flex items-center gap-1 rounded-lg bg-pink px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-pink-soft"
          >
            <CornerDownLeft size={12} /> enumerate
          </button>
        </div>
      )}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "danger" | "muted" | "arg";
}) {
  const tones: Record<string, string> = {
    ok: "border-teal-soft/30 bg-teal/20 text-teal-soft",
    warn: "border-amber-soft/30 bg-amber-soft/10 text-amber-soft",
    danger: "border-danger/30 bg-danger/10 text-danger",
    muted: "border-white/10 bg-white/[0.03] text-white/50",
    arg: "border-white/10 bg-white/[0.02] font-mono text-white/40",
  };
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${tones[tone]}`}>{children}</span>
  );
}
