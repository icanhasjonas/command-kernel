import { cn } from "@command-kernel/ui";
import { useFrames } from "../../wire/frames";

/** Compact one frame's JSON for display; anything that is not JSON is shown as sent. */
function pretty(text: string): string {
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

/**
 * Every message the wire client sent and received, exactly as it crossed the network:
 * socket frames and HTTP requests side by side, so the visitor sees the same command
 * travel either way. The heartbeat is left out.
 */
export function FrameLog() {
  const frames = useFrames();
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-baseline gap-2 text-[13px] text-white/70">
        On the wire <span className="text-[12px] text-white/40">newest first</span>
      </div>
      {frames.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-white/45">
          Nothing sent yet. Press any button on the left: its frame shows up here, then the server's
          answer.
        </p>
      ) : (
        <ol
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region must take focus so a keyboard can scroll it (axe scrollable-region-focusable)
          tabIndex={0}
          aria-label="Frames on the wire, newest first"
          className="mt-3 max-h-[440px] space-y-1.5 overflow-y-auto rounded pr-1 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {frames.map((f) => (
            <li key={f.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
              <span className={cn(f.dir === "out" ? "text-sky-300" : "text-teal-soft")}>
                {f.dir === "out" ? "→" : "←"} {f.via}
              </span>
              <span className="break-all text-white/75">
                {f.head && <span className="text-white/95">{f.head} </span>}
                {pretty(f.text)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
