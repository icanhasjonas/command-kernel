import type { Grant } from "@command-kernel/core";
import { cn } from "@command-kernel/ui";
import { ShieldCheck } from "lucide-react";
import { ASKED } from "./use-gate-lab";

/**
 * The grant as the kernel minted it: the signature, and everything it is bound to.
 * Before an approval the same card shows what WILL be bound, unsigned, so the
 * visitor sees the shape of the thing they are about to create.
 */
export function GrantCard({ grant, principal }: { grant: Grant | null; principal: string }) {
  const minutes = grant?.expiresAt
    ? Math.max(0, Math.round((grant.expiresAt - Date.now()) / 60_000))
    : null;
  const pending = "not signed yet";
  const rows: [string, string][] = [
    ["approved by", principal],
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
        grant ? "border-amber-soft/30 bg-amber-soft/[0.04]" : "border-white/10 border-dashed",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 font-medium text-[13px]",
          grant ? "text-amber-soft" : "text-white/55",
        )}
      >
        <ShieldCheck size={15} /> {grant ? "Grant" : "Grant, once you Allow"}
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
        <dd className={grant ? "break-all text-amber-soft/90" : "text-white/35"}>
          {grant?.sig ?? "HMAC-SHA256 over all of the above"}
        </dd>
      </dl>
    </div>
  );
}
