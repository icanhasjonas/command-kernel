import type { PathSegment } from "@command-kernel/core";
import { bindInvokers, commandAttr, KERNEL_HOST_ID, KernelInvoker } from "@command-kernel/ui";
import { useEffect, useRef } from "react";
import { useDemo } from "../../demo/demo-context";
import { drivers, kernel } from "../../demo/kernel";
import { resendHere } from "../../providers/submissions";
import { DriverHead } from "./DriverHead";

const byId = (id: string) => {
  const n = kernel.roots().find((x) => x.id === id);
  if (!n) throw new Error(`${id} is not a root command`);
  return n;
};
const goUsers = byId("go.users");
const clear = byId("trace.clear");
const GATED: PathSegment[] = [{ id: resendHere.id, args: { submissionId: "sub_4819" } }];

/**
 * Driver #4: platform markup. `<button command="--ck:…">` fires a `command` event,
 * and one `bindInvokers` listener runs it through the same kernel. `<KernelInvoker>`
 * picks the element from the node: a link for a pure navigation, a button for an
 * action, so the markup is right without the author deciding.
 */
export function InvokerDriver() {
  const host = useRef<HTMLDivElement>(null);
  const { getCtx, showResult, say, ran } = useDemo();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    return bindInvokers(el, drivers.invoker, getCtx, {
      onResult: (res) => {
        ran(res.node.id);
        showResult(res.result);
      },
      onGate: (res) => say(`"${res.node.title}" is gated: approve it from the palette`, "warn"),
      onArgs: (res) => say(`Needs ${res.missing.join(", ")}`, "warn"),
      onDisambiguate: (res) => say(`Which one? ${res.candidates.map((c) => c.label).join(", ")}`),
      onUnresolved: () => say("Stale markup: that command id no longer exists", "warn"),
      onError: (error) => say(`Command failed: ${String(error)}`, "warn"),
    });
  }, [getCtx, showResult, say, ran]);

  return (
    <div className="p-5">
      {/* the one host every <button command> points at via commandfor */}
      <div ref={host} id={KERNEL_HOST_ID} hidden />
      <DriverHead
        driver="invoker"
        title="<button command>"
        how="Plain HTML Invoker Commands. No onClick, no handler per button: the markup names the command, one listener runs it through the kernel."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <KernelInvoker
          node={goUsers}
          path={[{ id: goUsers.id }]}
          className="rounded-lg border border-sky-300/25 px-3 py-1.5 text-[13px] text-sky-200 hover:bg-sky-300/10"
        >
          Go to Users (an &lt;a&gt;: the URL driver runs it)
        </KernelInvoker>
        <KernelInvoker
          node={clear}
          path={[{ id: clear.id }]}
          as="button"
          className="rounded-lg border border-white/12 px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.06]"
        >
          Clear the kernel trace
        </KernelInvoker>
        <KernelInvoker
          node={resendHere}
          path={GATED}
          className="rounded-lg border border-amber-soft/30 px-3 py-1.5 text-[13px] text-amber-soft hover:bg-amber-soft/10"
        >
          Resend sub_4819 (gated)
        </KernelInvoker>
      </div>
      <pre className="mt-4 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-black/30 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-white/60">
        {`<button command="${commandAttr(GATED)}"\n        commandfor="${KERNEL_HOST_ID}">`}
      </pre>
    </div>
  );
}
