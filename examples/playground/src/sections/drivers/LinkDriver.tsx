import type { PathSegment } from "@command-kernel/core";
import { serializePath } from "@command-kernel/core";
import { DriverHead } from "./DriverHead";

const LINKS: { path: PathSegment[]; label: string; expect: string; tone: string }[] = [
  {
    path: [{ id: "go.subs" }],
    label: "Go to Submissions",
    expect: "runs: a pure command needs no approval",
    tone: "text-teal-soft",
  },
  {
    path: [{ id: "email.send", args: { to: "ada@analytical.engine" } }],
    label: "Email Ada",
    expect:
      "short of args: the palette asks for the rest, then for your OK, since a link never sends on its own",
    tone: "text-amber-soft",
  },
  {
    path: [{ id: "users.send_reset", args: { user: "jon@wall.north" } }],
    label: "Reset Jon's password",
    expect: "stops at the gate: a URL carries args, never an approval; you give that",
    tone: "text-red-300",
  },
];

/** Driver #3: the URL. A path serializes to a hash, and the hash runs through command(). */
export function LinkDriver() {
  return (
    <div className="p-5">
      <DriverHead
        driver="deeplink"
        title="Deeplinks"
        how="Any command path is a URL, args included, serialized from the same arg schema. Click one and watch how far it gets."
      />
      <ul className="mt-4 space-y-2">
        {LINKS.map((l) => {
          const href = `#${serializePath(l.path)}`;
          return (
            <li key={href}>
              <a
                href={href}
                className="group block rounded-lg border border-white/8 px-3 py-2.5 hover:border-white/20 hover:bg-white/[0.03]"
              >
                <div className="text-[13px] font-medium text-white/90 group-hover:text-white">
                  {l.label}
                </div>
                <div className={`mt-0.5 text-[12px] ${l.tone}`}>{l.expect}</div>
                <div className="mt-1 truncate font-mono text-[12px] text-white/45">{href}</div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
