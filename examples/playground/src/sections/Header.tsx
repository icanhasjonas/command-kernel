import type { Role } from "@command-kernel/core";
import { cn } from "@command-kernel/ui";
import { RotateCcw } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useDemo } from "../demo/demo-context";
import { kernel } from "../demo/kernel";
import { LabBanner } from "./wire/LabBanner";

const ROLES: Role[] = ["admin", "advisor", "viewer"];

const NAV = [
  { href: "#drivers", label: "Drivers" },
  { href: "#agent", label: "Agent" },
  { href: "#gate", label: "Gate" },
  { href: "#wire", label: "Wire" },
  { href: "#schema", label: "Schema" },
  { href: "#pipes", label: "Pipes" },
];

/**
 * The two things that change what the kernel answers, always in reach: who you are
 * (the gate reads the role) and the session (a new one invalidates every grant).
 */
export function Header() {
  const { ctx, setRole, say } = useDemo();
  const ref = useHeaderHeight();
  return (
    <header
      ref={ref}
      className="sticky top-0 z-30 border-white/8 border-b bg-[#0a0b10]/85 backdrop-blur-xl"
    >
      <LabBanner />
      <div className="mx-auto flex max-w-[1320px] items-center gap-4 px-6 py-3 md:gap-6">
        <a href="#top" className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-pink" />
          <span className="whitespace-nowrap font-semibold text-[14px] text-white">
            command-kernel
          </span>
        </a>
        <SectionNav className="hidden xl:flex" />
        <div className="ml-auto flex items-center gap-2">
          <fieldset className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            <legend className="sr-only">Your role</legend>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={ctx.user.role === r}
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-md px-2 py-1 text-[12px] capitalize transition-colors sm:px-2.5",
                  ctx.user.role === r ? "bg-pink text-white" : "text-white/55 hover:text-white/90",
                )}
              >
                {r}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            aria-label="New session"
            title="Rotate the signing key and forget always-allow rules: every grant minted so far stops verifying"
            onClick={() => {
              kernel.evidence.rotate();
              kernel.policy.clear();
              say("New session: every grant and always-allow rule is now void", "warn");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.07] hover:text-white"
          >
            <RotateCcw size={13} /> <span className="hidden sm:inline">New session</span>
          </button>
        </div>
      </div>
      {/* narrower screens: the sections get a row of their own, always there */}
      <div className="mx-auto flex max-w-[1320px] items-center gap-3 overflow-x-auto px-6 pb-2.5 xl:hidden">
        <SectionNav className="flex" />
      </div>
    </header>
  );
}

/** Publishes the header's height as `--header-h`, so the rail and anchors clear it. */
function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const obs = new ResizeObserver(() =>
      root.style.setProperty("--header-h", `${el.offsetHeight}px`),
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function SectionNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Sections" className={cn("items-center gap-1", className)}>
      {NAV.map((n) => (
        <a
          key={n.href}
          href={n.href}
          className="whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] text-white/55 hover:bg-white/5 hover:text-white/90"
        >
          {n.label}
        </a>
      ))}
    </nav>
  );
}
