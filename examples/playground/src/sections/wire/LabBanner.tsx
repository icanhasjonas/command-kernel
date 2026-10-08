import { Radio } from "lucide-react";
import { useLabFlag } from "../../wire/flags";

/**
 * The `beta-banner` flag, made visible: while the lab's server has it on, every
 * connected visitor sees this strip across the top of the page, and it goes for all
 * of them the moment anyone turns the flag off. It lives in the sticky header, so it
 * never covers the page.
 */
export function LabBanner() {
  const on = useLabFlag("beta-banner");
  if (!on) return null;
  return (
    <a
      href="#wire"
      className="flex items-center justify-center gap-2 border-sky-300/20 border-b bg-sky-300/[0.08] px-6 py-1.5 text-center text-[12px] text-sky-100 hover:bg-sky-300/[0.12]"
    >
      <Radio size={12} className="shrink-0 text-sky-300" />
      {/* a phone keeps the strip to one line: the tap still lands on the switch in Wire */}
      <span>
        Beta banner, on for every visitor.{" "}
        <span className="text-sky-100/60 md:hidden">Switch it off in Wire.</span>
        <span className="text-sky-100/60 max-md:hidden">
          A flag on the lab's server: turn it off in Wire and it goes for everyone.
        </span>
      </span>
    </a>
  );
}
