import { cn } from "@command-kernel/ui";
import { useState } from "react";
import { useDemo } from "../demo/demo-context";
import { kernel } from "../demo/kernel";
import { Scout } from "../Scout";
import { AgentConsole } from "./agent/AgentConsole";
import { DriverHead } from "./drivers/DriverHead";
import { Code, Panel, Section } from "./Section";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "tree", label: "What the agent sees" },
] as const;

/** Chapter 2: an LLM is just another driver, and it cannot approve its own calls. */
export function AgentSection() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("chat");
  const { ctx } = useDemo();
  return (
    <Section
      id="agent"
      index="02 · agent"
      title="An agent drives the same tree"
      lede={
        <>
          Tools are kernel commands, picked by id from the same registry, so a tool call meets the
          same gate a click does. When the gate wants a human, the agent gets a <Code>gate</Code>{" "}
          back and waits: only your Allow mints a grant. Ask it to reset a password, then let it try
          forging the approval.
        </>
      }
    >
      <Panel>
        <div className="flex flex-wrap items-center gap-4 border-white/8 border-b p-5">
          <DriverHead
            driver="agent"
            title="Agent"
            how="A toy keyword model picks the tool. Swap in a real model: everything after the pick stays the same."
          />
          <div role="tablist" className="ml-auto flex rounded-lg border border-white/10 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-[12px]",
                  tab === t.id ? "bg-white/10 text-white" : "text-white/55 hover:text-white/85",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tab === "chat" ? (
          <AgentConsole />
        ) : (
          <div className="h-[460px]">
            <Scout kernel={kernel} ctx={ctx} />
          </div>
        )}
      </Panel>
    </Section>
  );
}
