import { Kbd } from "@command-kernel/ui";
import { Bot } from "lucide-react";
import { useDemo } from "../demo/demo-context";
import { Code } from "./Section";

/**
 * The thesis in one viewport: one kernel, many drivers. The primary action opens
 * the palette (driver #1); the rail beside this column is already listening.
 */
export function Hero() {
  const { openPalette } = useDemo();
  return (
    <section id="top" className="pt-16 lg:pt-24">
      <p className="font-mono text-[12px] text-pink-soft">a headless command kernel</p>
      <h1 className="mt-4 max-w-[19ch] text-balance font-semibold text-[40px] text-white leading-[1.05] tracking-tight sm:text-[60px]">
        One kernel. Every UI is a driver.
      </h1>
      <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-white/65">
        Every action in an app is a command: plain data with an arg schema, a gate, and a{" "}
        <Code>run</Code>. A palette, keyboard chords, URLs, <Code>&lt;button command&gt;</Code>{" "}
        markup and an AI agent are just ways of calling the same verb, through the same gate.
        Everything you do on this page lands in the kernel trace, so you can watch it happen.
      </p>
      <div className="mt-9 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => openPalette()}
          className="flex items-center gap-2.5 rounded-xl bg-pink px-5 py-3 font-semibold text-[14px] text-white shadow-glow transition hover:bg-pink-soft"
        >
          Open the palette <Kbd className="border-white/30 bg-white/15 text-white">⌘K</Kbd>
        </button>
        <a
          href="#agent"
          className="flex items-center gap-2 rounded-xl border border-white/12 px-4 py-3 text-[14px] text-white/80 transition hover:bg-white/[0.05] hover:text-white"
        >
          <Bot size={16} /> Ask the agent
        </a>
      </div>
      <dl className="mt-12 grid max-w-[560px] gap-5 border-white/8 border-t pt-6 sm:grid-cols-3 sm:gap-6">
        {[
          ["1 verb", "command(path, args) for every driver"],
          ["1 gate", "permissions live in the kernel, never a UI"],
          ["1 schema", "chips, agent tools, URLs from one declaration"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold text-[15px] text-white">{k}</dt>
            <dd className="mt-1 text-[13px] leading-snug text-white/50">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
