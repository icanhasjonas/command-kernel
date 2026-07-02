import type { CommandNode, CommandResult, Ctx, Kernel, PathSegment } from "@command-kernel/core";
import { serializePath } from "@command-kernel/core";
import { bindInvokers, commandAttr, Icon, KERNEL_HOST_ID, KernelInvoker } from "@command-kernel/ui";
import { useEffect, useRef } from "react";
import { navCommands, toggleTheme } from "./providers/misc";
import { resendHere } from "./providers/submissions";

/**
 * DRIVER #5 demo — the native HTML Invoker Commands API as a kernel driver.
 *
 * `<button command="--ck:…" commandfor="…">` is plain platform markup. One
 * `bindInvokers` listener on the host routes every fired command through the SAME
 * `kernel.command()` + gate as the palette, the agent, and the hash deeplinks.
 * `<KernelInvoker>` picks the element: a link for navigation, a button for action.
 */
interface Props {
  kernel: Kernel;
  getCtx: () => Ctx;
  onResult: (r: CommandResult) => void;
  onToast: (msg: string) => void;
}

// three REAL registry nodes, three intents — the panel duplicates nothing:
// the node objects come straight from the providers the kernel itself runs.
function mustFind(id: string): CommandNode {
  const n = navCommands.find((x) => x.id === id);
  if (!n) throw new Error(`${id} missing from navCommands`);
  return n;
}
const goUsers = mustFind("go.users");

const NAV: PathSegment[] = [{ id: goUsers.id }]; // pure -> <a href>, by effectMode
const ACTION: PathSegment[] = [{ id: toggleTheme.id }]; // pure but forced as="button"
const GATED: PathSegment[] = [{ id: resendHere.id, args: { submissionId: "sub_4819" } }];

export function InvokerPanel({ kernel, getCtx, onResult, onToast }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return bindInvokers(host, kernel, getCtx, {
      onResult: (res) => onResult(res.result),
      onGate: (res) => onToast(`🔒 "${res.node.title}" is gated — open ⌘K to approve`),
      onArgs: (res) =>
        onToast(`needs args: ${[...res.missing, ...res.errors.map((e) => e.argId)].join(", ")}`),
      onDisambiguate: (res) =>
        onToast(`which one? ${res.candidates.map((c) => c.label).join(", ")}`),
      onUnresolved: () => onToast("stale markup — that command id no longer exists"),
      onError: (error) => onToast(`command failed: ${String(error)}`),
    });
  }, [kernel, getCtx, onResult, onToast]);

  return (
    <div className="mt-4 w-full rounded-xl border border-white/8 bg-white/[0.02] p-4 text-left">
      {/* the single host every <button command> points at via commandfor */}
      <div ref={hostRef} id={KERNEL_HOST_ID} hidden />

      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-white/55">
        <Icon name="MousePointerClick" size={13} className="text-pink-soft" /> native HTML invokers
        — <code className="text-white/55">&lt;button command&gt;</code>
      </div>
      <div className="mb-3 text-[12px] text-white/35">
        Baseline-2026 platform markup. The browser fires a{" "}
        <code className="text-white/55">command</code> event; one{" "}
        <code className="text-white/55">bindInvokers</code> listener runs it through the same gate.
        A <code className="text-white/55">&lt;KernelInvoker&gt;</code> renders a{" "}
        <span className="text-teal-soft/80">link for navigation</span>, a{" "}
        <span className="text-pink-soft">button for action</span>.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <KernelInvoker
          node={goUsers}
          path={NAV}
          className="rounded-lg border border-teal-soft/25 bg-teal/10 px-3 py-1.5 text-[12px] text-teal-soft/90 hover:bg-teal/20"
        >
          &lt;a&gt; · Go to Users (nav)
        </KernelInvoker>
        <KernelInvoker
          node={toggleTheme}
          path={ACTION}
          as="button"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06]"
        >
          &lt;button command&gt; · Toggle density (fires)
        </KernelInvoker>
        {/* gated + run -> effectMode "writes" -> as="auto" picks the button itself */}
        <KernelInvoker
          node={resendHere}
          path={GATED}
          className="rounded-lg border border-amber-soft/20 bg-amber-soft/5 px-3 py-1.5 text-[12px] text-amber-soft/80 hover:bg-amber-soft/10"
        >
          &lt;button command&gt; · Resend (🔒 gated)
        </KernelInvoker>
      </div>

      <div className="mt-3 space-y-1 font-mono text-[11px] text-white/35">
        <div>
          nav link href: <span className="text-teal-soft/80">#{serializePath(NAV)}</span>
        </div>
        <div>
          gated command: <span className="text-amber-soft/80">{commandAttr(GATED)}</span>
        </div>
      </div>
    </div>
  );
}
