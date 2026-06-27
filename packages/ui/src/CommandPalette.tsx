import {
  argList,
  argText,
  type CommandNode,
  type CommandResult,
  type Ctx,
  isFilled,
  type Kernel,
} from "@command-kernel/core";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, SearchX } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArgOptions } from "./ArgOptions";
import { ConfirmPanel } from "./ConfirmPanel";
import { cn } from "./cn";
import { Icon } from "./icon";
import { Kbd } from "./Kbd";
import { Pill } from "./Pill";
import { ResultRow } from "./ResultRow";
import { usePalette } from "./usePalette";

interface Props {
  open: boolean;
  kernel: Kernel;
  ctx: Ctx;
  roots: CommandNode[];
  trigger?: { id: string; nonce: number } | null;
  onClose: () => void;
  onResult: (r: CommandResult) => void;
  onExecuted: (id: string) => void;
}

export function CommandPalette({
  open,
  kernel,
  ctx,
  roots,
  trigger,
  onClose,
  onResult,
  onExecuted,
}: Props) {
  const p = usePalette({ kernel, ctx, roots, open, trigger, onResult, onExecuted, onClose });
  const browseRef = useRef<HTMLInputElement>(null);
  const argRef = useRef<HTMLInputElement>(null);
  const [modHeld, setModHeld] = useState(false);

  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) =>
      (e.key === "Meta" || e.key === "Control") && setModHeld(true);
    const up = (e: globalThis.KeyboardEvent) =>
      (e.key === "Meta" || e.key === "Control") && setModHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus follows mode/arg
  useEffect(() => {
    const t = setTimeout(() => (p.mode === "args" ? argRef : browseRef).current?.focus(), 10);
    return () => clearTimeout(t);
  }, [p.mode, p.arg?.activeArg]);

  const activeSpec = p.arg?.node.args?.find((a) => a.id === p.arg?.activeArg);
  const freeText = activeSpec ? activeSpec.kind !== "enum" : false;
  const namedArgs = (p.arg?.node.args ?? []).filter((a) => !a.positional);
  const filledCount = namedArgs.filter((a) => isFilled(p.arg?.values[a.id])).length;
  const activeChips = activeSpec?.multiple ? argList(p.arg?.values[activeSpec.id]) : [];

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      return p.move(1, p.mode === "args" ? p.argOptions.length : p.ranked.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      return p.move(-1, p.mode === "args" ? p.argOptions.length : p.ranked.length);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      return p.back();
    }

    if (p.mode === "confirm") {
      if (e.key === "Enter" && !p.confirm?.blocked) p.confirmProceed();
      return;
    }

    if (p.mode === "args") {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const opt = p.argOptions[p.selected];
        if (opt) return p.commitArg(opt.value);
        if (freeText && p.argQuery.trim()) return p.commitArg(p.argQuery.trim());
        // a multiple arg: Enter on an empty input means "done adding" -> advance
        if (activeSpec?.multiple) return p.finishArg();
      }
      return;
    }

    // browse
    const sel = p.ranked[p.selected];
    if (e.key === "Enter" && sel) {
      e.preventDefault();
      return p.activate(sel.node, e.metaKey || e.ctrlKey);
    }
    if (e.key === "ArrowRight" && sel?.node.resolve) {
      e.preventDefault();
      return void p.drill(sel.node);
    }
    if ((e.key === "ArrowLeft" || e.key === "Backspace") && p.query === "" && p.frames.length > 1) {
      e.preventDefault();
      return p.back();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content
              onEscapeKeyDown={(e) => e.preventDefault()}
              onKeyDown={onKeyDown}
              aria-describedby={undefined}
              asChild
            >
              <motion.div
                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="-translate-x-1/2 fixed top-[14vh] left-1/2 z-50 w-[min(640px,92vw)] overflow-hidden rounded-2xl border border-white/10 bg-ck-glass shadow-ck-float backdrop-blur-2xl"
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>

                {/* breadcrumb + context */}
                <div className="flex items-center justify-between border-white/5 border-b px-4 py-2 text-[12px]">
                  <div className="flex items-center gap-1.5 text-white/45">
                    {p.frames.map((f, i) => (
                      <span key={f.node?.id ?? "root"} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-white/20">▸</span>}
                        <span className={i === p.frames.length - 1 ? "text-white/80" : ""}>
                          {f.node?.title ?? "Backoffice"}
                        </span>
                      </span>
                    ))}
                  </div>
                  <span className="flex items-center gap-2 font-mono text-white/40">
                    <span className="text-ck-accent-soft/80">
                      {ctx.location.label ?? ctx.location.module}
                    </span>
                    <span className="text-white/20">·</span>
                    <span>{ctx.user.role}</span>
                  </span>
                </div>

                {/* input / arg pills */}
                <div className="px-4 py-3">
                  {p.mode === "args" && p.arg ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/80">
                        <Icon name={p.arg.node.icon} size={15} className="text-ck-accent-soft" />
                        {p.arg.node.title}
                      </span>
                      {namedArgs.map((spec) => {
                        const val = p.arg?.values[spec.id];
                        if (spec.id === p.arg?.activeArg) {
                          return (
                            <span
                              key={spec.id}
                              className="inline-flex items-center gap-1.5 rounded-pill border border-ck-accent/60 bg-pink/15 px-2.5 py-1 shadow-[0_0_0_1px_rgba(228,19,98,0.35)]"
                            >
                              <span className="font-mono text-[12px] text-ck-accent-soft/70">
                                {spec.label}
                              </span>
                              {/* accumulated values for a multiple (listOf) arg */}
                              {activeChips.map((c) => (
                                <span
                                  key={c}
                                  className="rounded bg-pink/25 px-1.5 py-0.5 font-mono text-[11px] text-ck-accent-soft"
                                >
                                  {c}
                                </span>
                              ))}
                              <input
                                ref={argRef}
                                value={p.argQuery}
                                onChange={(e) => {
                                  p.setArgQuery(e.target.value);
                                  p.setSelected(0);
                                }}
                                placeholder={
                                  spec.multiple ? "add… (↵ done)" : (spec.placeholder ?? "…")
                                }
                                className="w-44 bg-transparent font-mono text-[12px] text-ck-accent-soft outline-none placeholder:text-ck-accent-soft/40"
                              />
                            </span>
                          );
                        }
                        return (
                          <Pill
                            key={spec.id}
                            label={spec.label}
                            value={argText(val)}
                            state={isFilled(val) ? "filled" : "empty"}
                            {...(spec.required !== undefined && { required: spec.required })}
                          />
                        );
                      })}
                      <span className="ml-auto font-mono text-[11px] text-white/35">
                        {filledCount} of {namedArgs.length}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <Search size={17} className="shrink-0 text-white/40" />
                      <input
                        ref={browseRef}
                        value={p.query}
                        onChange={(e) => {
                          p.setQuery(e.target.value);
                          p.setSelected(0);
                        }}
                        placeholder="Search commands, users, forms, submissions…"
                        className="flex-1 bg-transparent text-[15px] text-white/90 outline-none placeholder:text-white/30"
                      />
                      {p.resolving && <Loader2 size={15} className="animate-spin text-white/40" />}
                    </div>
                  )}
                </div>

                {/* body */}
                <div className="border-white/5 border-t">
                  {p.mode === "confirm" && p.confirm ? (
                    <ConfirmPanel
                      node={p.confirm.node}
                      verdict={p.confirm.verdict}
                      blocked={p.confirm.blocked}
                      role={ctx.user.role}
                      alwaysLabel={p.confirmAlwaysLabel}
                      onProceed={p.confirmProceed}
                      onAlways={p.confirmAlways}
                    />
                  ) : p.mode === "args" ? (
                    <ArgOptions
                      options={p.argOptions}
                      loading={p.argLoading}
                      selected={p.selected}
                      freeText={freeText}
                      typed={p.argQuery}
                      onPick={p.commitArg}
                      onHover={p.setSelected}
                    />
                  ) : p.ranked.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-3 py-10 text-white/35">
                      <SearchX size={22} />
                      <span className="text-[13px]">no commands match “{p.query}”</span>
                    </div>
                  ) : (
                    <div className="max-h-[44vh] overflow-y-auto px-2 py-2">
                      {p.ranked.map((item, i) => (
                        <ResultRow
                          key={item.node.id}
                          item={item}
                          active={i === p.selected}
                          modHeld={modHeld}
                          onActivate={(exec) => p.activate(item.node, exec)}
                          onHover={() => p.setSelected(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* footer */}
                <div className="flex items-center gap-3 border-white/5 border-t px-4 py-2 text-[11px] text-white/35">
                  <Hint k="↵" label={p.mode === "browse" ? "select" : "confirm"} />
                  {p.mode === "browse" && <Hint k="→" label="drill in" />}
                  {p.mode === "browse" && <Hint k="⌘↵" label="run as page" />}
                  <Hint k="esc" label="back" />
                  <span
                    className={cn(
                      "ml-auto flex items-center gap-1.5 transition-opacity",
                      modHeld ? "opacity-100" : "opacity-50",
                    )}
                  >
                    hold <Kbd glow={modHeld}>⌘</Kbd> for chords
                  </span>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Kbd>{k}</Kbd> {label}
    </span>
  );
}
