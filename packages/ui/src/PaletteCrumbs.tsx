/**
 * The palette's "where am I" line: the frames you drilled through, or, with a
 * value in hand, the trail it took ("notes.md ▸ Load as text ▸ Encrypt for…").
 */
export function PaletteCrumbs({ items }: { items: string[] }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-white/45">
      {items.map((label, i) => (
        // a trail may name the same command twice, so the position is the identity
        // biome-ignore lint/suspicious/noArrayIndexKey: crumbs are positional
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <span className="text-white/20">▸</span>}
          <span className={i === items.length - 1 ? "truncate text-white/80" : "truncate"}>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}
