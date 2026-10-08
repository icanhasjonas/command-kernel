import { cn } from "@command-kernel/ui";
import { FLAGS, type Flag, type LabStatus } from "../../wire/spec";
import { btn } from "../lab-ui";

/** The shared flags: one set on the server for every visitor. Flipping one needs advisor. */
export function FlagsPanel({
  server,
  flip,
}: {
  server: LabStatus | null;
  flip: (f: Flag) => void;
}) {
  return (
    <div>
      <div className="text-[13px] text-white/70">Shared flags</div>
      <div className="mt-1 text-[12px] text-white/45">gate: advisor or higher</div>
      <ul className="mt-3 space-y-2">
        {FLAGS.map((f) => {
          const on = server?.flags[f];
          return (
            <li key={f} className="flex items-center gap-3">
              <span className="w-28 font-mono text-[12px] text-white/80">{f}</span>
              <span
                className={cn(
                  "w-10 font-mono text-[12px]",
                  on === undefined ? "text-white/30" : on ? "text-teal-soft" : "text-white/50",
                )}
              >
                {on === undefined ? "-" : on ? "on" : "off"}
              </span>
              <button type="button" className={btn} onClick={() => flip(f)}>
                Flip
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
