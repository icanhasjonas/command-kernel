export function Highlight({ text, positions }: { text: string; positions: number[] }) {
  if (positions.length === 0) return <>{text}</>;
  const set = new Set(positions);
  return (
    <>
      {Array.from(text).map((ch, i) =>
        set.has(i) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable string render
          <span key={i} className="match-hl">
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
