import { pickTool } from "@command-kernel/agent";
import type { ArgValues, CommandNode, CommandResult, Ctx, GateVerdict } from "@command-kernel/core";
import {
  allowAlways,
  allowLabel,
  command,
  evaluateGate,
  grantForPath,
  ruleForNode,
} from "@command-kernel/core";
import { cn, Icon } from "@command-kernel/ui";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  ChevronRight,
  Compass,
  MessageSquare,
  Send,
  ShieldAlert,
  ShieldX,
  Sparkles,
  X,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { AGENT_TOOLS } from "./agent-tools";
import { Scout } from "./Scout";

type CallStatus = "gated" | "blocked" | "done" | "denied";

interface Entry {
  id: number;
  kind: "user" | "agent" | "call";
  text?: string;
  node?: CommandNode;
  values?: ArgValues;
  status?: CallStatus;
  verdict?: GateVerdict;
}

const EXAMPLES = [
  "email jane.doe@gmail.com a welcome note",
  "reset the password for jon@wall.north",
  "resync submission sub_4819 to the crm",
  "go to submissions",
];

export function AgentPanel({
  open,
  ctx,
  onResult,
  onExecuted,
  onClose,
}: {
  open: boolean;
  ctx: Ctx;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
  onClose: () => void;
}) {
  const [log, setLog] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [view, setView] = useState<"chat" | "scout">("chat");
  const seq = useRef(0);
  const add = (e: Omit<Entry, "id">) => {
    const id = ++seq.current;
    setLog((l) => [...l, { ...e, id }]);
    return id;
  };
  const patch = (id: number, e: Partial<Entry>) =>
    setLog((l) => l.map((x) => (x.id === id ? { ...x, ...e } : x)));

  async function run(goal: string) {
    if (!goal.trim()) return;
    setInput("");
    add({ kind: "user", text: goal });
    const pick = pickTool(goal, AGENT_TOOLS);
    if (!pick) {
      add({ kind: "agent", text: "No tool matches that — try one of the examples." });
      return;
    }
    // the agent drives the SAME universal verb the palette does: one addressed
    // call with the operator's role as principal — and NO grant, so a gated tip
    // comes straight back as a gate for the operator to Allow.
    const res = await command(
      AGENT_TOOLS,
      { path: [{ id: pick.node.id, args: pick.values }], execute: true, role: ctx.user.role },
      ctx,
    );
    if (res.kind === "result") return finish(pick.node, pick.values, res.result);
    if (res.kind === "gate") {
      add({
        kind: "call",
        node: pick.node,
        values: pick.values,
        status: res.verdict.allowed ? "gated" : "blocked",
        verdict: res.verdict,
      });
      return;
    }
    if (res.kind === "args")
      add({ kind: "agent", text: `Missing args: ${res.missing.join(", ")}` });
  }

  function finish(node: CommandNode, values: ArgValues, result: CommandResult | null, id?: number) {
    onExecuted(node.id);
    if (result) onResult(result);
    if (id) patch(id, { status: "done" });
    else add({ kind: "call", node, values, status: "done", verdict: evaluateGate(node, ctx) });
    add({ kind: "agent", text: result?.message ?? "Done." });
  }

  // operator clicked Allow: mint a grant bound to THIS exact tool+args, set it
  // as the tip's evidence, and re-issue the identical verb.
  async function allow(entry: Entry) {
    if (!entry.node || !entry.values) return;
    const seg = { id: entry.node.id, args: entry.values };
    const res = await command(
      AGENT_TOOLS,
      { path: [{ ...seg, evidence: grantForPath([seg]) }], execute: true, role: ctx.user.role },
      ctx,
    );
    if (res.kind === "result") finish(entry.node, entry.values, res.result, entry.id);
  }

  // operator clicked Always allow: record the standing rule, then re-issue with
  // NO grant — the kernel policy now auto-satisfies the gate and won't ask again.
  async function allowForever(entry: Entry) {
    if (!entry.node || !entry.values) return;
    allowAlways(ruleForNode(entry.node, entry.values));
    const res = await command(
      AGENT_TOOLS,
      { path: [{ id: entry.node.id, args: entry.values }], execute: true, role: ctx.user.role },
      ctx,
    );
    if (res.kind === "result") finish(entry.node, entry.values, res.result, entry.id);
  }

  // lab proof: the agent FABRICATES a grant. verifyGrant fails (wrong salt/sig)
  // so the call bounces straight back to the gate — approval can't be forged.
  async function forge(entry: Entry) {
    if (!entry.node || !entry.values) return;
    const res = await command(
      AGENT_TOOLS,
      {
        path: [
          { id: entry.node.id, args: entry.values, evidence: { nonce: "forged", sig: "deadbeef" } },
        ],
        execute: true,
        role: ctx.user.role,
      },
      ctx,
    );
    add({
      kind: "agent",
      text:
        res.kind === "gate"
          ? "🛑 forged grant rejected — the gate re-asks. The agent can't fake an Allow."
          : "⚠️ forge slipped through — that's a bug.",
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(input);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 360, damping: 36 }}
          className="fixed top-0 right-0 z-40 flex h-full w-[min(420px,92vw)] flex-col border-white/10 border-l bg-glass backdrop-blur-2xl"
        >
          <header className="flex items-center gap-2.5 border-white/5 border-b px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-pink/15 text-pink-soft">
              <Bot size={17} />
            </span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-white/90">Agent</div>
              <div className="text-[11px] text-white/40">
                {view === "chat"
                  ? "driver #2 · same kernel, same gate"
                  : "driver #3 · the self-describing tree"}
              </div>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              <button
                type="button"
                onClick={() => setView("chat")}
                title="Chat"
                className={cn(
                  "rounded-md p-1.5",
                  view === "chat" ? "bg-pink text-white" : "text-white/45 hover:text-white/80",
                )}
              >
                <MessageSquare size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView("scout")}
                title="Scout the command tree"
                className={cn(
                  "rounded-md p-1.5",
                  view === "scout" ? "bg-pink text-white" : "text-white/45 hover:text-white/80",
                )}
              >
                <Compass size={14} />
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-white/40 hover:bg-white/5 hover:text-white/70"
            >
              <X size={16} />
            </button>
          </header>

          {view === "scout" && <Scout ctx={ctx} />}
          {view === "chat" && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {log.length === 0 && (
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[12px] text-white/50">
                      <Sparkles size={13} className="text-pink-soft" /> try a goal
                    </div>
                    <div className="space-y-1.5">
                      {EXAMPLES.map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => run(ex)}
                          className="flex w-full items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-left text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                        >
                          <ChevronRight size={12} className="text-white/30" /> {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {log.map((e) =>
                  e.kind === "user" ? (
                    <div
                      key={e.id}
                      className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-pink/20 px-3 py-2 text-[13px] text-white/90"
                    >
                      {e.text}
                    </div>
                  ) : e.kind === "agent" ? (
                    <div key={e.id} className="max-w-[85%] text-[13px] text-white/60">
                      {e.text}
                    </div>
                  ) : (
                    <CallCard
                      key={e.id}
                      entry={e}
                      onAllow={() => allow(e)}
                      onAlways={() => allowForever(e)}
                      onForge={() => forge(e)}
                      onDeny={() => patch(e.id, { status: "denied" })}
                    />
                  ),
                )}
              </div>

              <form
                onSubmit={onSubmit}
                className="flex items-center gap-2 border-white/5 border-t px-3 py-3"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tell the agent a goal…"
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/90 outline-none placeholder:text-white/30 focus:border-pink/40"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-pink p-2 text-white hover:bg-pink-soft"
                >
                  <Send size={15} />
                </button>
              </form>
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function CallCard({
  entry,
  onAllow,
  onAlways,
  onForge,
  onDeny,
}: {
  entry: Entry;
  onAllow: () => void;
  onAlways: () => void;
  onForge: () => void;
  onDeny: () => void;
}) {
  const { node, values, status } = entry;
  if (!node) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-[12px] text-white/45">
        <Icon name={node.icon} size={13} className="text-pink-soft" />
        <span className="font-mono">tool call</span>
      </div>
      <div className="mt-1.5 font-mono text-[12px] text-white/80">{node.id}(</div>
      <div className="pl-3 font-mono text-[12px] text-white/60">
        {Object.entries(values ?? {}).map(([k, v]) => (
          <div key={k}>
            {k}: <span className="text-teal-soft">"{v}"</span>
          </div>
        ))}
        {Object.keys(values ?? {}).length === 0 && <div className="text-white/30">no args</div>}
      </div>
      <div className="font-mono text-[12px] text-white/80">)</div>

      <div className="mt-2.5 border-white/5 border-t pt-2.5">
        {status === "gated" && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[12px] text-amber-soft">
              <ShieldAlert size={13} /> gate: {node.gate?.reason ?? "confirm required"}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAllow}
                className="rounded-md bg-pink px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-pink-soft"
              >
                Allow
              </button>
              <button
                type="button"
                onClick={onAlways}
                className="rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.08] hover:text-white/90"
              >
                {allowLabel(ruleForNode(node, values ?? {}))}
              </button>
              <button
                type="button"
                onClick={onDeny}
                className="rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/5"
              >
                Deny
              </button>
            </div>
            <button
              type="button"
              onClick={onForge}
              className="text-[11px] text-white/30 underline decoration-dotted underline-offset-2 hover:text-white/55"
            >
              try forging the grant →
            </button>
          </div>
        )}
        {status === "blocked" && (
          <div className="flex items-center gap-1.5 text-[12px] text-danger">
            <ShieldX size={13} /> blocked —{" "}
            {entry.verdict?.checks.find((c) => !c.ok)?.label ?? "not permitted"}
          </div>
        )}
        {status === "done" && (
          <div className="flex items-center gap-1.5 text-[12px] text-teal-soft">
            <Check size={13} /> ran
          </div>
        )}
        {status === "denied" && <div className="text-[12px] text-white/35">denied by operator</div>}
      </div>
    </div>
  );
}
