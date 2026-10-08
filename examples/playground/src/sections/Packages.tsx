import { Section } from "./Section";

const PACKAGES = [
  [
    "@command-kernel/core",
    "The kernel: the verb, the gate, grants, schemas, pipes, shapes. Pure TypeScript, no framework.",
  ],
  [
    "@command-kernel/ui",
    "The React palette on this page. One driver, restylable, holds no permission logic.",
  ],
  [
    "@command-kernel/agent",
    "Commands as MCP tools, and a four-tool navigator an LLM walks the tree with.",
  ],
  ["@command-kernel/react", "Keyboard layers and scopes: which keys mean what, where."],
  ["@command-kernel/wire", "The same verb over HTTP and WebSocket, with the gate on the server."],
] as const;

/** The close: what this page was made of, as installable pieces. */
export function Packages() {
  return (
    <Section
      id="packages"
      title="What this page is made of"
      lede="Every panel above composes these packages the way an app would. The kernel is the product; each UI is a package you can swap."
    >
      <dl className="divide-y divide-white/8 border-white/8 border-y">
        {PACKAGES.map(([name, what]) => (
          <div key={name} className="grid gap-1 py-4 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6">
            <dt className="font-mono text-[13px] text-white/90">{name}</dt>
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
