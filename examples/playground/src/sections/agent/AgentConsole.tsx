import { cn } from "@command-kernel/ui";
import { ArrowUp } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { CallCard } from "./CallCard";
import { useAgent } from "./use-agent";

const EXAMPLES = [
  "reset the password for jon@wall.north",
  "email jane.doe@gmail.com a welcome note",
  "resync submission sub_4819 to the crm",
  "encrypt the launch date for ada@analytical.engine",
  "go to submissions",
];

/** The agent as a chat: say a goal, watch it become a tool call, approve what the gate holds. */
export function AgentConsole() {
  const agent = useAgent();
  const [input, setInput] = useState("");
  const log = useRef<HTMLDivElement>(null);

  // keep the newest line in view, scrolling the log only (never the page around it)
  useEffect(() => {
    const el = log.current;
    if (el && agent.lines.length > 0) el.scrollTop = el.scrollHeight;
  }, [agent.lines.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void agent.ask(input);
    setInput("");
  }

  return (
    // grows with the conversation, then scrolls: no tall empty box before the first goal
    <div className="flex max-h-[460px] flex-col">
      <div ref={log} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {agent.lines.length === 0 && (
          <div>
            <p className="text-[13px] text-white/55">Give it a goal, or start from one of these:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void agent.ask(ex)}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-left text-[12px] text-white/70 hover:border-violet-300/40 hover:text-white"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {agent.lines.map((l) =>
          l.kind === "call" ? (
            <CallCard
              key={l.id}
              call={l.call}
              onAllow={() => void agent.allow(l.call)}
              onAlways={() => void agent.always(l.call)}
              onForge={() => void agent.forge(l.call)}
              onDeny={() => agent.deny(l.call)}
            />
          ) : (
            <p
              key={l.id}
              className={cn(
                "max-w-[85%] text-[13px] leading-relaxed",
                l.kind === "you"
                  ? "ml-auto rounded-2xl rounded-br-sm bg-violet-400/15 px-3 py-2 text-white/90"
                  : "text-white/65",
              )}
            >
              {l.text}
            </p>
          ),
        )}
      </div>
      {/* once the chat has started, the examples stay in reach (the agent points at them) */}
      {agent.lines.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-white/8 border-t px-3 py-2">
          <span className="shrink-0 text-[11px] text-white/40">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => void agent.ask(ex)}
              className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:border-violet-300/40 hover:text-white"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 border-white/8 border-t p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Goal for the agent"
          placeholder="Tell the agent what to do…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/90 outline-none placeholder:text-white/35 focus:border-violet-300/50"
        />
        <button
          type="submit"
          aria-label="Send"
          className="rounded-lg bg-violet-400/80 p-2 text-white hover:bg-violet-400"
        >
          <ArrowUp size={16} />
        </button>
      </form>
    </div>
  );
}
