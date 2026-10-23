/** `match-hl` is the hook for a host that wants its own mark. */
const MATCH = "match-hl underline decoration-ck-fg-muted decoration-1 underline-offset-[3px]";

/**
 * The letters a query matched, underlined: weight stays 500 (Arc uses two weights only) and the
 * colour stays the title's, so a match reads without shouting.
 */
export function Highlight({ text, positions }: { text: string; positions: number[] }) {
  if (positions.length === 0) return <>{text}</>;
  const set = new Set(positions);
  return (
    <>
      {Array.from(text).map((ch, i) =>
        set.has(i) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable string render
          <span key={i} className={MATCH}>
            {ch}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable string render
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}
