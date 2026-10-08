import type { FeedItem } from "./use-lab";

const said = (f: FeedItem) =>
  f.command === "lab.flag"
    ? `turned ${f.what}`
    : f.command === "lab.rotate"
      ? `rotated the ${f.what} key`
      : f.command;

/**
 * What the server pushed: every change any visitor made, as it happened. Open this page
 * in a second tab (or send it to someone) and watch their changes land here.
 */
export function LiveFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="border-white/8 border-t px-5 py-4">
      <div className="text-[13px] text-white/70">
        Pushed by the server{" "}
        <span className="text-[12px] text-white/40">
          every visitor's changes, live; open a second tab to see it
        </span>
      </div>
      {feed.length === 0 ? (
        <p className="mt-2 text-[12px] text-white/45">No changes since you arrived.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-[12px]" aria-live="polite">
          {feed.map((f) => (
            <li key={`${f.at}-${f.by.tag}-${f.command}`} className="flex gap-3">
              <span className="font-mono text-white/40 tabular-nums">
                {new Date(f.at).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className="text-white/80">
                {f.mine ? "you" : `${f.by.tag} (${f.by.role})`} {said(f)}
                {f.viaHttp && (
                  <span className="text-white/45"> · over HTTP, so this tab heard no push</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
