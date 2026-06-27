import { cn } from "./cn";
import { Kbd } from "./Kbd";

interface Props {
  onClick: () => void;
  className?: string;
}

export function CommandLauncher({ onClick, className }: Props) {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open command bar"
      className={cn(
        "group inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/50 shadow-sm transition-all hover:border-ck-accent-soft/50 hover:text-white/80 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ck-accent",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="h-[17px] w-[17px]"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <span className="hidden max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[160px] group-hover:opacity-100 sm:inline">
        Everything lives here now
      </span>
      <span className="inline-flex gap-0.5">
        <Kbd>{mod}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
