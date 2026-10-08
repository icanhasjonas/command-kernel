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
      <p className="mt-10 pb-24 text-[13px] text-white/40">
        Demo data is synthetic: people, files and submissions are made up, and nothing here sends an
        email.
      </p>
    </Section>
  );
}
