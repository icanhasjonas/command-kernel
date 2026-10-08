import { cn } from "@command-kernel/ui";
import type { ConnectionStatus } from "@command-kernel/wire";
import type { LabRole, LabStatus } from "../../wire/spec";
import { btn } from "../lab-ui";
import type { Via } from "./call";

const DOT: Record<ConnectionStatus, string> = {
  open: "bg-teal-soft",
  connecting: "bg-amber-soft animate-pulse",
  reconnecting: "bg-amber-soft animate-pulse",
  idle: "bg-white/30",
  closed: "bg-red-400",
};

const SAYS: Record<ConnectionStatus, string> = {
  open: "socket open",
  connecting: "connecting",
  reconnecting: "reconnecting",
  idle: "not connected",
  closed: "socket closed, calls go over HTTP",
};

/**
 * Where the wire stands: the socket's state as the client reports it, what the SERVER
 * says about this visitor, and the two ways to change how calls travel.
 */
export function ConnectionBar(p: {
  status: ConnectionStatus;
  server: LabStatus | null;
  online: number | null;
  role: LabRole;
  via: Via;
  setVia: (v: Via) => void;
  cut: () => void;
  reconnect: () => void;
}) {
  const live = p.status === "open";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-white/8 border-b px-5 py-3.5 text-[13px]">
      <span className="flex items-center gap-2" aria-live="polite">
        <span className={cn("size-2 rounded-full", DOT[p.status])} />
        <span className="text-white/85">{SAYS[p.status]}</span>
      </span>
      {p.server && (
        <span className="font-mono text-[12px] text-white/55">
          edge <span className="text-white/85">{p.server.colo}</span> · you are{" "}
          <span className="text-white/85">
            {p.server.you.visitor} ({p.role})
          </span>
          {p.online !== null && (
            <>
              {" "}
              · <span className="text-white/85">{p.online}</span> online
            </>
          )}
        </span>
      )}
      <div className="flex w-full flex-wrap items-center gap-2 whitespace-nowrap sm:ml-auto sm:w-auto">
        <fieldset className="flex rounded-lg border border-white/12 p-0.5" aria-label="Transport">
          {(["auto", "http"] as const).map((v) => (
            <label
              key={v}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1 text-[12px]",
                p.via === v ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80",
              )}
            >
              <input
                type="radio"
                name="wire-via"
                className="sr-only"
                checked={p.via === v}
                onChange={() => p.setVia(v)}
              />
              {v === "auto" ? "Socket, else HTTP" : "HTTP only"}
            </label>
          ))}
        </fieldset>
        {live ? (
          <button type="button" className={btn} onClick={p.cut}>
            Cut the socket
          </button>
        ) : (
          <button type="button" className={btn} onClick={p.reconnect}>
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
