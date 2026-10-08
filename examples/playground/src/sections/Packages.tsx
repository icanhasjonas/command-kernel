import { ADOPT_SNIPPET } from "./adopt/snippet";
import { Section } from "./Section";

/** [name, what it does, used on this page] */
const PACKAGES = [
  [
    "@command-kernel/core",
    "The kernel: the verb, the gate, grants, schemas, pipes, shapes. Pure TypeScript, no framework. In your browser AND in the Worker.",
    true,
  ],
  [
    "@command-kernel/ui",
    "The React palette on this page. One driver, restylable, holds no permission logic.",
    true,
  ],
  [
    "@command-kernel/agent",
    "Commands as MCP tools, and a four-tool navigator an LLM walks the tree with.",
    true,
  ],
  [
    "@command-kernel/wire",
    "The same verb over HTTP and WebSocket, with the gate on the server. The lab above runs on it.",
    true,
  ],
  ["@command-kernel/react", "Keyboard layers and scopes: which keys mean what, where.", false],
] as const;

/** The close: what this page was made of, as installable pieces, and the one it does not use. */
export function Packages() {
  return (
    <Section
      id="packages"
      title="What this page is made of"
      lede="The panels above compose these packages the way an app would. The kernel is the product; each UI is a package you can swap."
    >
      <dl className="divide-y divide-white/8 border-white/8 border-y">
        {PACKAGES.map(([name, what, here]) => (
          <div key={name} className="grid gap-1 py-4 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6">
            <dt className="font-mono text-[13px] text-white/90">
              {name}
              {!here && (
                <span className="mt-1 block font-sans text-[11px] text-white/40">
                  not on this page
                </span>
              )}
            </dt>
            <dd className="text-[14px] text-white/60">{what}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-10">
        <h3 className="font-semibold text-[16px] text-white">What adopting it looks like</h3>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-white/60">
          One command, then two drivers on it. That is the whole integration: the palette and the
          agent both call this one kernel and meet its gate. Pre-release: not on npm yet.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[12px] leading-relaxed text-white/75">
          {ADOPT_SNIPPET}
        </pre>
      </div>
      <p className="mt-10 pb-24 text-[13px] text-white/40">
        Demo data is synthetic: people, files and submissions are made up, and nothing here sends an
        email.
      </p>
    </Section>
  );
}
