import { toMcpTool } from "@command-kernel/agent";
import { describeNode, serializePath } from "@command-kernel/core";
import { cn, Icon } from "@command-kernel/ui";
import { useState } from "react";
import { useDemo } from "../demo/demo-context";
import { kernel } from "../demo/kernel";
import { Code, Panel, Section } from "./Section";
import { authored, SAMPLE_ARGS } from "./schema/render";

const SHOWN = Object.keys(SAMPLE_ARGS);
const nodes = SHOWN.flatMap((id) => kernel.roots().find((n) => n.id === id) ?? []);

function Block({ title, note, children }: { title: string; note: string; children: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-[13px] text-white/85">{title}</h3>
        <span className="text-[12px] text-white/45">{note}</span>
      </div>
      <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-white/70">
        {children}
      </pre>
    </div>
  );
}

/** Chapter 4: the keystone. One arg schema, rendered by every surface from the same object. */
export function SchemaSection() {
  const [id, setId] = useState(nodes[0]?.id ?? "");
  const { openPalette } = useDemo();
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const tool = toMcpTool(node);
  const link = `#${serializePath([{ id: node.id, args: SAMPLE_ARGS[node.id] ?? {} }])}`;
  const d = describeNode(node);
  return (
    <Section
      id="schema"
      title="One schema, every surface"
      lede={
        <>
          A command declares its args once. The palette renders them as pills, the agent gets them
          as an MCP tool's <Code>inputSchema</Code>, a URL serializes them, and the kernel validates
          them before any gate or run. Nothing below is hand-written: each block is the library
          rendering the live node.
        </>
      }
    >
      <div role="tablist" aria-label="Command" className="flex flex-wrap gap-2">
        {nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            role="tab"
            aria-selected={n.id === id}
            onClick={() => setId(n.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px]",
              n.id === id
                ? "border-pink/50 bg-pink/15 text-white"
                : "border-white/10 text-white/60 hover:text-white/90",
            )}
          >
            <Icon name={n.icon} size={13} /> {n.title}
          </button>
        ))}
      </div>
      <Panel className="mt-4 grid gap-6 p-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Block title="Authored once" note="the node, as the kernel holds it">
            {authored(node)}
          </Block>
          <div>
            <h3 className="font-medium text-[13px] text-white/85">In the palette</h3>
            {/* exactly what following the URL below does: the same args, through the link
                driver, so a command that writes stops for your OK there too */}
            <button
              type="button"
              onClick={() => openPalette(node.id, "deeplink", SAMPLE_ARGS[node.id] ?? {})}
              className="mt-2 rounded-lg bg-pink px-3 py-1.5 font-medium text-[13px] text-white hover:bg-pink-soft"
            >
              Open it as the URL below does
            </button>
          </div>
          <Block title="As a URL" note="serializePath(path)">
            {link}
          </Block>
        </div>
        <div className="space-y-5">
          <Block title="As an agent tool" note="toMcpTool(node)">
            {JSON.stringify(tool, null, 2)}
          </Block>
          <Block title="What an agent learns" note="describeNode(node)">
            {JSON.stringify({ executable: d.executable, effect: d.effect, gate: d.gate }, null, 2)}
          </Block>
        </div>
      </Panel>
    </Section>
  );
}
