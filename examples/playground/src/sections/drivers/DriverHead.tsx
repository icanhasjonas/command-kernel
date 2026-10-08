import { Icon } from "@command-kernel/ui";
import { DRIVER_META } from "../../trace/drivers";
import type { Driver } from "../../trace/trace-store";

/** A driver panel's heading, drawn with the same icon and color its calls get in the trace. */
export function DriverHead({ driver, title, how }: { driver: Driver; title: string; how: string }) {
  const d = DRIVER_META[driver];
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
        <Icon name={d.icon} size={16} className={d.tone} />
      </span>
      <div>
        <h3 className="font-semibold text-[15px] text-white">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-white/55">{how}</p>
      </div>
    </div>
  );
}
