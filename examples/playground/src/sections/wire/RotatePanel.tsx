import { cn } from "@command-kernel/ui";
import { KEYS, type KeyName, type LabStatus } from "../../wire/spec";
import { btn, Step } from "../lab-ui";
import type { useLab } from "./use-lab";

type Lab = ReturnType<typeof useLab>;

/**
 * The confirm flow with the SERVER in charge: it says the call needs a confirmation,
 * mints the grant itself once it has checked the caller, and spends it on use.
 */
export function RotatePanel({ lab, server }: { lab: Lab; server: LabStatus | null }) {
  return (
    <div>
      <div className="text-[13px] text-white/70">Rotate a key</div>
      <div className="mt-1 text-[12px] text-white/45">gate: admin only, confirm every run</div>
      <fieldset className="mt-3 flex gap-2" aria-label="Key">
        {KEYS.map((k: KeyName) => (
          <label
            key={k}
            className={cn(
              "cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-[12px] has-focus-visible:ring-2 has-focus-visible:ring-white/30",
              lab.key === k
                ? "border-amber-soft/40 bg-amber-soft/[0.06] text-amber-soft"
                : "border-white/12 text-white/60 hover:text-white/85",
            )}
          >
            <input
              type="radio"
              name="lab-key"
              className="sr-only"
              checked={lab.key === k}
              onChange={() => lab.chooseKey(k)}
            />
            {k} <span className="text-white/45">{server?.keys[k] ?? "…"}</span>
          </label>
        ))}
      </fieldset>
      <ol className="mt-4 space-y-3">
        <Step n={1} label="Ask" done={lab.owed || lab.grant !== null}>
          <button type="button" className={btn} onClick={() => void lab.ask()}>
            Send it, no grant
          </button>
        </Step>
        <Step n={2} label="Confirm" done={lab.grant !== null}>
          <button
            type="button"
            className={btn}
            disabled={!lab.owed}
            onClick={() => void lab.confirm()}
          >
            Confirm, as you
          </button>
        </Step>
        <Step n={3} label="Run" done={lab.used}>
          <button
            type="button"
            className={btn}
            disabled={!lab.grant || lab.used}
            onClick={() => void lab.run()}
          >
            Run it on the server
          </button>
        </Step>
      </ol>
      <div className="mt-5 text-[13px] text-white/70">Try to break it</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={!lab.used}
          onClick={() => void lab.replay()}
        >
          Use it twice
        </button>
        <button
          type="button"
          className={btn}
          disabled={!lab.grant}
          onClick={() => void lab.otherKey()}
        >
          Use it for the other key
        </button>
        <button
          type="button"
          className={btn}
          disabled={!lab.grant}
          onClick={() => void lab.forge()}
        >
          Tamper with the signature
        </button>
      </div>
      {lab.grant && (
        <div
          className={cn(
            "mt-3 break-all font-mono text-[11px]",
            lab.used ? "text-white/40" : "text-amber-soft/80",
          )}
        >
          grant · sig {lab.grant.sig}
          {lab.used && (
            <span className="text-white/60"> · spent, the server will not take it again</span>
          )}
        </div>
      )}
    </div>
  );
}
