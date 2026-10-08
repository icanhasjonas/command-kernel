import { cn, Icon, Kbd } from "@command-kernel/ui";
import { type Place, useDemo } from "../../demo/demo-context";
import { kernel } from "../../demo/kernel";
import { DriverHead } from "./DriverHead";

const PLACES: (Place & { icon: string })[] = [
  { module: "home", label: "Home", icon: "Home" },
  { module: "users", label: "Users", icon: "Users" },
  { module: "forms", label: "Forms", icon: "FileText" },
  { module: "forms", recordId: "ip/long-form", label: "form ip/long-form", icon: "FileText" },
  { module: "submissions", label: "Submissions", icon: "Inbox" },
  { module: "submissions", recordId: "sub_4819", label: "submission sub_4819", icon: "Inbox" },
];

const same = (a: { module: string; recordId?: string }, b: { module: string; recordId?: string }) =>
  a.module === b.module && a.recordId === b.recordId;

/** Driver #1 and #2: the palette, and chords that jump straight into one command. */
export function PaletteDriver() {
  const { ctx, setPlace, openPalette } = useDemo();
  const chords = [...kernel.chords(ctx)];
  return (
    <div className="p-5">
      <DriverHead
        driver="palette"
        title="Palette and chords"
        how="Search commands or people, drill into a category, fill named args as pills. A chord, ⌘J then a key, opens the palette straight on its command."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openPalette()}
          className="flex items-center gap-2 rounded-lg bg-pink px-3 py-1.5 font-medium text-[13px] text-white hover:bg-pink-soft"
        >
          Open the palette{" "}
          <Kbd className="border-white/30 bg-white/15 text-white pointer-coarse:hidden">⌘K</Kbd>
        </button>
        {chords.map(([key, node]) => (
          <button
            key={key}
            type="button"
            onClick={() => openPalette(node.id, "chord")}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[13px] text-white/75 hover:bg-white/[0.05] hover:text-white"
          >
            <Kbd className="pointer-coarse:hidden">⌘J {key.toUpperCase()}</Kbd> {node.title}
          </button>
        ))}
      </div>
      <div className="mt-5 border-white/8 border-t pt-4">
        <div className="text-[13px] text-white/60">
          Where you are changes the ranking and pre-fills args (open the palette on a submission:
          "Resend this submission" jumps to the top, already bound).
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* a command can take you somewhere without a chip (Docs): it gets one while you are there */}
          {[
            ...PLACES,
            ...(PLACES.some((p) => same(p, ctx.location))
              ? []
              : [
                  {
                    ...ctx.location,
                    label: ctx.location.label ?? ctx.location.module,
                    icon: "Link",
                  },
                ]),
          ].map((p) => {
            const on = same(p, ctx.location);
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => setPlace(p)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                  on
                    ? "border-pink/50 bg-pink/15 text-pink-soft"
                    : "border-white/10 text-white/60 hover:text-white/90",
                )}
              >
                <Icon name={p.icon} size={13} /> {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
