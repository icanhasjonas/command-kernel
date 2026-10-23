import { cn } from "./cn.js";
import { Kbd } from "./Kbd.js";

interface Props {
  onClick: () => void;
  className?: string;
  /** accessible name for the button */
  label?: string;
  /** the copy that slides out on hover; pass "" to show nothing */
  hint?: string;
}

export function CommandLauncher({
  onClick,
  className,
  label = "Open the command palette",
  hint = "",
}: Props) {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        // Arc's quiet control: a hairline on the surface, colour on hover, a scale on press
        "group inline-flex min-h-9 items-center gap-2 rounded-ck-control border border-ck-border bg-ck-surface px-3 text-[12px] font-medium text-ck-fg-secondary transition-[background-color,color,transform] duration-150 hover:bg-ck-surface-muted hover:text-ck-fg active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ck-accent motion-reduce:transition-none motion-reduce:active:scale-100",
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
      {hint && (
        <span className="hidden max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[160px] group-hover:opacity-100 sm:inline">
          {hint}
        </span>
      )}
      <span className="inline-flex gap-0.5">
        <Kbd>{mod}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
