import type { Grant } from "@command-kernel/core";
import { ShieldCheck } from "lucide-react";
import { ASKED } from "./use-gate-lab";

/** The grant as the kernel minted it: the signature, and everything it is bound to. */
export function GrantCard({ grant, principal }: { grant: Grant | null; principal: string }) {
  if (!grant) {
    return (
      <div className="rounded-lg border border-white/10 border-dashed p-4 text-[13px] leading-relaxed text-white/45">
        No grant yet. Send the request, then Allow it: the kernel signs exactly what you approved.
      </div>
    );
  }
  const minutes = grant.expiresAt
    ? Math.max(0, Math.round((grant.expiresAt - Date.now()) / 60_000))
    : null;
  const rows: [string, string][] = [
    ["approved by", principal],
    ["command", ASKED.id],
    ["args", `user=${ASKED.args.user}`],
    ["path", "(root)"],
    ["nonce", grant.nonce],
    ["expires", minutes === null ? "never" : `in ${minutes} min`],
  ];
  return (
    <div className="rounded-lg border border-amber-soft/30 bg-amber-soft/[0.04] p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-amber-soft">
        <ShieldCheck size={15} /> Grant
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 font-mono text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/45">{k}</dt>
            <dd className="truncate text-white/85">{v}</dd>
          </div>
        ))}
        <dt className="text-white/45">sig</dt>
        <dd className="break-all text-amber-soft/90">{grant.sig}</dd>
      </dl>
    </div>
  );
}
