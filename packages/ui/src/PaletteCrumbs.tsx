import { ChevronRight } from "lucide-react";

/**
 * The palette's "where am I" line: the frames you drilled through, or, with a
 * value in hand, the trail it took ("notes.md › Load as text › Encrypt for…").
 */
export function PaletteCrumbs({ items }: { items: string[] }) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-ck-fg-muted">
      {items.map((label, i) => (
        // a trail may name the same command twice, so the position is the identity
        // biome-ignore lint/suspicious/noArrayIndexKey: crumbs are positional
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight size={12} strokeWidth={1.75} aria-hidden="true" />}
          <span className={i === items.length - 1 ? "truncate text-ck-fg-secondary" : "truncate"}>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}
