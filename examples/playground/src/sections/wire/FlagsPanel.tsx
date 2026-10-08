import { cn } from "@command-kernel/ui";
import { FLAGS, type Flag, type LabStatus } from "../../wire/spec";
import { btn } from "../lab-ui";

/** What each flag does, on the server, for everyone. */
const DOES: Record<Flag, string> = {
  maintenance: "the server's gate refuses every key rotation",
  "beta-banner": "every visitor sees a banner at the top",
};

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
      <ul className="mt-3 space-y-3">
        {FLAGS.map((f) => {
          const on = server?.flags[f];
          return (
            <li key={f} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[12px]">
                  <span className="text-white/85">{f}</span>
                  <span
                    className={cn(
                      on === undefined ? "text-white/30" : on ? "text-teal-soft" : "text-white/45",
                    )}
                  >
                    {on === undefined ? "-" : on ? "on" : "off"}
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-white/45">on: {DOES[f]}</div>
              </div>
              <button
                type="button"
                aria-label={`Flip ${f}`}
                className={btn}
                onClick={() => flip(f)}
              >
                Flip
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
