import { cn } from "@command-kernel/ui";
import { Radio } from "lucide-react";
import { useLabFlag } from "../../wire/flags";

/**
 * The `beta-banner` flag, made visible: while the lab's server has it on, every
 * connected visitor sees this in the header, and it goes for all of them the moment
 * anyone turns the flag off. It lives in the chrome, so it never covers the page.
 */
export function LabBanner({ className }: { className?: string }) {
  const on = useLabFlag("beta-banner");
  if (!on) return null;
  return (
    <a
      href="#wire"
      title="A flag on the lab's server, shared by every visitor. Turn it off in Wire."
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-300/30 bg-sky-300/[0.06] px-2.5 py-1 text-[12px] text-sky-100 hover:border-sky-300/60",
        className,
      )}
    >
      <Radio size={12} className="text-sky-300" />
      beta-banner: on for everyone
    </a>
  );
}
