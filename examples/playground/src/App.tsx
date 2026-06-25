import type { CommandResult, Ctx, Role } from "@command-kernel/core";
import { bumpFrecency, createKernel, parseDeeplink, serializePath } from "@command-kernel/core";
import { CommandPalette, cn, Icon, Kbd } from "@command-kernel/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Command as CommandIcon, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentPanel } from "./AgentPanel";
import { personEntity } from "./providers/entities";
import { ROOTS } from "./providers/registry";

const PLACES = [
  { module: "home", label: "Home", icon: "Home" },
  { module: "forms", recordId: "ip/long-form", label: "forms ▸ ip ▸ long-form", icon: "FileText" },
  { module: "submissions", recordId: "sub_4819", label: "submission · sub_4819", icon: "Inbox" },
  { module: "users", label: "Users", icon: "Users" },
] as const;

const ROLES: Role[] = ["admin", "advisor", "viewer"];

const FEATURES = [
  {
    icon: "Search",
    title: "Fuzzy + weighted",
    body: "fzf-style match with highlight, blended with per-command weight, context boost, and frecency.",
  },
  {
    icon: "ChevronsRight",
    title: "Drill or run",
    body: "Enter drills into a category; ⌘↵ runs the search itself as a results page. Quicksilver.",
  },
  {
    icon: "Tags",
    title: "Named-arg pills",
    body: "Type ⌘E. Each arg is a pill with its own async completion. Slack/Discord style.",
  },
  {
    icon: "Lock",
    title: "Gates on the node",
    body: "Permissions declared once. Flip role to viewer and watch reset/impersonate lock.",
  },
  {
    icon: "Compass",
    title: "Context-aware",
    body: "Switch where you are — the menu re-ranks and pre-binds args to the record you're on.",
  },
  {
    icon: "Bot",
    title: "Same kernel, agent",
    body: "Open the agent. It picks a command, fills args, hits the identical gate. One core.",
  },
];

interface Toast {
  id: number;
  msg: string;
  tone: CommandResult["kind"];
}

export default function App() {
  // ONE kernel instance shared by every driver — same gate, same evidence, same
  // policy for the human palette and the AI agent. That sharing IS the invariant.
  const kernel = useMemo(() => createKernel({ roots: ROOTS, entities: [personEntity] }), []);
  const [open, setOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [trigger, setTrigger] = useState<{ id: string; nonce: number } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const nonce = useRef(0);
  const toastSeq = useRef(0);

  const [ctx, setCtx] = useState<Ctx>({
    location: { module: "home", label: "Home" },
    user: { id: "u_1001", name: "Jonas Frost", role: "admin", brand: "circle" },
    now: 0,
    frecency: {},
  });

  useEffect(() => {
    const chords = new Map(ROOTS.filter((n) => n.chord).map((n) => [n.chord as string, n.id]));
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && chords.has(k)) {
        e.preventDefault();
        setOpen(true);
        setTrigger({ id: chords.get(k) as string, nonce: ++nonce.current });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const onResult = useCallback((r: CommandResult) => {
    if (r.kind === "navigate" && r.payload && typeof r.payload === "object") {
      const pl = r.payload as { module?: string; label?: string; recordId?: string };
      setCtx((c) => ({
        ...c,
        location: {
          module: pl.module ?? c.location.module,
          label: pl.label,
          recordId: pl.recordId,
        },
      }));
    }
    setToast({ id: ++toastSeq.current, msg: r.message, tone: r.kind });
  }, []);

  // DRIVER #4 — the URL hash IS a command driver. Buttons + <a href="#/cmd/...">
  // set the hash; this bridge parses it and runs the SAME command()/gate. A gated
  // link can't fire — it comes back as a gate. Commands as the universal substrate.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [hash, setHash] = useState("");
  useEffect(() => {
    const run = () => {
      setHash(window.location.hash);
      const h = window.location.hash.replace(/^#\/?/, "");
      if (!h.startsWith("cmd/")) return;
      kernel.command({ path: parseDeeplink(h), execute: true }, ctxRef.current).then((res) => {
        const seq = ++toastSeq.current;
        if (res.kind === "result") onResult(res.result);
        else if (res.kind === "gate")
          setToast({
            id: seq,
            msg: `🔒 "${res.node.title}" is gated — open ⌘K to approve`,
            tone: "toast",
          });
        else if (res.kind === "disambiguate")
          setToast({
            id: seq,
            msg: `which one? ${res.candidates.map((c) => c.label).join(", ")}`,
            tone: "toast",
          });
        else if (res.kind === "args")
          setToast({
            id: seq,
            msg: `needs args: ${[...res.missing, ...res.errors.map((e) => e.argId)].join(", ")}`,
            tone: "toast",
          });
      });
    };
    window.addEventListener("hashchange", run);
    run();
    return () => window.removeEventListener("hashchange", run);
  }, [kernel, onResult]);

  // a page affordance (button or link) that triggers a command via the hash
  const linkTo = (path: Parameters<typeof serializePath>[0]) => `#${serializePath(path)}`;

  return (
    <div className="lab-grid relative min-h-screen overflow-hidden">
      {/* top bar */}
      <header className="flex items-center gap-3 px-6 py-4">
        <span className="size-2.5 rounded-full bg-pink shadow-glow" />
        <span className="font-semibold text-[14px] text-white/80">Backoffice</span>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/40">
          command-system lab
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setCtx((c) => ({ ...c, user: { ...c.user, role: r } }))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] capitalize transition",
                  ctx.user.role === r ? "bg-pink text-white" : "text-white/50 hover:text-white/80",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              kernel.evidence.rotate();
              kernel.policy.clear();
              setToast({
                id: ++toastSeq.current,
                msg: "new session — every grant + always-allow rule invalidated",
                tone: "toast",
              });
            }}
            title="Rotate the session salt + clear always-allow (what a browser reload does for free)"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06]"
          >
            <RotateCcw size={13} /> New session
          </button>
          <button
            type="button"
            onClick={() => setAgentOpen((a) => !a)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06]"
          >
            <Bot size={14} /> Agent
          </button>
        </div>
      </header>

      {/* hero */}
      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-[8vh] text-center">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-b from-white to-white/55 bg-clip-text font-semibold text-[40px] text-transparent leading-tight tracking-tight"
        >
          One command system.
          <br />
          Every surface.
        </motion.h1>
        <p className="mt-4 max-w-xl text-[15px] text-white/45">
          A headless kernel — categories, async resolve, named args, gates — rendered as a palette,
          driven by an agent, jumped to by chords. The UI is just a driver.
        </p>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pulse-ring mt-8 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-white/85 transition hover:bg-white/[0.07]"
        >
          <CommandIcon size={17} className="text-pink-soft" />
          <span className="text-[14px] font-medium">Open the palette</span>
          <Kbd glow>⌘K</Kbd>
        </button>

        {/* context switcher */}
        <div className="mt-9 w-full">
          <div className="mb-2 text-[12px] text-white/35">
            you are here — switch context and watch the menu react
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PLACES.map((pl) => {
              const on =
                ctx.location.module === pl.module &&
                ctx.location.recordId === ("recordId" in pl ? pl.recordId : undefined);
              return (
                <button
                  key={pl.label}
                  type="button"
                  onClick={() =>
                    setCtx((c) => ({
                      ...c,
                      location: {
                        module: pl.module,
                        label: pl.label,
                        recordId: "recordId" in pl ? pl.recordId : undefined,
                      },
                    }))
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition",
                    on
                      ? "border-pink/50 bg-pink/15 text-pink-soft"
                      : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/80",
                  )}
                >
                  <Icon name={pl.icon} size={13} /> {pl.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* commands as the universal substrate — buttons + links are drivers too */}
        <div className="mt-9 w-full rounded-xl border border-white/8 bg-white/[0.02] p-4 text-left">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] text-white/55">
            <Icon name="Link" size={13} className="text-pink-soft" /> commands as the universal
            substrate
          </div>
          <div className="mb-3 text-[12px] text-white/35">
            A button or an <code className="text-white/55">&lt;a href&gt;</code> is just a driver
            over <code className="text-white/55">command()</code> — same gate. A gated link can't
            fire from a click.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.hash = serializePath([{ id: "go.users" }]);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06]"
            >
              button → Go to Users
            </button>
            <a
              href={linkTo([{ id: "go.subs" }])}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06]"
            >
              link → Go to Submissions
            </a>
            <a
              href={linkTo([{ id: "users.send_reset", args: { user: "jon@wall.north" } }])}
              className="rounded-lg border border-amber-soft/20 bg-amber-soft/5 px-3 py-1.5 text-[12px] text-amber-soft/80 hover:bg-amber-soft/10"
            >
              gated link → Send reset (🔒 needs approval)
            </a>
          </div>
          {hash && (
            <div className="mt-3 font-mono text-[11px] text-white/35">
              current deeplink: <span className="text-teal-soft/80">{hash}</span>
            </div>
          )}
        </div>

        {/* feature grid */}
        <div className="mt-9 grid w-full grid-cols-1 gap-3 pb-20 text-left sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-pink/10 text-pink-soft">
                <Icon name={f.icon} size={16} />
              </div>
              <div className="mt-2.5 text-[13px] font-medium text-white/85">{f.title}</div>
              <div className="mt-1 text-[12px] text-white/40">{f.body}</div>
            </div>
          ))}
        </div>
      </main>

      <CommandPalette
        open={open}
        kernel={kernel}
        ctx={ctx}
        roots={ROOTS}
        trigger={trigger}
        onClose={() => setOpen(false)}
        onResult={onResult}
        onExecuted={(id) => setCtx((c) => ({ ...c, frecency: bumpFrecency(c.frecency, id) }))}
      />

      <AgentPanel
        open={agentOpen}
        kernel={kernel}
        ctx={ctx}
        onResult={onResult}
        onExecuted={(id) => setCtx((c) => ({ ...c, frecency: bumpFrecency(c.frecency, id) }))}
        onClose={() => setAgentOpen(false)}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            className={cn(
              "-translate-x-1/2 fixed bottom-8 left-1/2 z-[60] rounded-xl border px-4 py-2.5 text-[13px] shadow-float backdrop-blur-xl",
              toast.tone === "navigate" || toast.tone === "page"
                ? "border-teal-soft/30 bg-teal/30 text-teal-soft"
                : "border-pink/30 bg-pink/20 text-white",
            )}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
