import type { Grant } from "@command-kernel/core";
import { cn } from "@command-kernel/ui";
import { ShieldCheck } from "lucide-react";
import { ASKED, type GrantLife } from "./use-gate-lab";

const SAYS: Record<GrantLife, string> = {
  live: "Grant",
  spent: "Grant · spent: it ran once and will not run again",
  void: "Grant · void: the key that signed it is gone",
};

/**
 * The grant as the kernel minted it: the signature, and everything it is bound to.
 * Before an approval the same card shows what WILL be bound, unsigned, so the
 * visitor sees the shape of the thing they are about to create. A grant that can no
 * longer run (spent, or its key rotated) greys out and says why.
 */
export function GrantCard({
  grant,
  principal,
  life,
}: {
  grant: Grant | null;
  principal: string;
  life: GrantLife;
}) {
  const live = grant !== null && life === "live";
  const minutes = grant?.expiresAt
    ? Math.max(0, Math.round((grant.expiresAt - Date.now()) / 60_000))
    : null;
  const pending = "not signed yet";
  const rows: [string, string][] = [
    // before the Allow it is who WILL sign, not who did
    [grant ? "approved by" : "to be approved by", principal],
    ["command", ASKED.id],
    ["args", `user=${ASKED.args.user}`],
    ["path", "(root)"],
    ["nonce", grant?.nonce ?? pending],
    ["expires", grant ? (minutes === null ? "never" : `in ${minutes} min`) : pending],
  ];
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        live && "border-amber-soft/30 bg-amber-soft/[0.04]",
        grant && !live && "border-white/12 bg-white/[0.02]",
        !grant && "border-white/10 border-dashed",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 font-medium text-[13px]",
          live ? "text-amber-soft" : "text-white/55",
        )}
      >
        <ShieldCheck size={15} /> {grant ? SAYS[life] : "Grant, once you Allow"}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 font-mono text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/45">{k}</dt>
            <dd className={cn("truncate", v === pending ? "text-white/35" : "text-white/85")}>
              {v}
            </dd>
          </div>
        ))}
        <dt className="text-white/45">sig</dt>
        <dd
          className={cn(
            "[overflow-wrap:anywhere]",
            live ? "text-amber-soft/90" : grant ? "text-white/40 line-through" : "text-white/35",
          )}
        >
          {grant?.sig ?? "HMAC-SHA256 over all of the above"}
        </dd>
      </dl>
    </div>
  );
}
