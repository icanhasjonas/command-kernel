import type { ArgValues, PathSegment } from "./types";

/**
 * Deeplinks — DRIVER #4, the keystone in URL form.
 *
 * A deeplink is just a serialized `PathSegment[]`: the command-id chain plus the
 * tip's args, driven by the SAME arg schema as the palette chips and the agent
 * tool params. `parseDeeplink` turns `cmd/users/users.search?email=x` back into a
 * path you hand straight to `kernel.command(...)`.
 *
 * THE SECURITY PROPERTY: a URL can carry args but it CANNOT carry a grant — the
 * session salt never leaves the kernel. So a deeplink into a gated command can
 * never auto-fire; `kernel.command({ path: parseDeeplink(url), execute: true })`
 * returns a `gate`, and the driver routes the human to the approval UI. That
 * falls out of the trust core for free; deeplink.test.ts proves it.
 *
 * Scope: the id chain round-trips, and the TIP segment's args round-trip.
 * Intermediate-segment args (rare in a deeplink) are not encoded — link to the
 * command you mean, with its args.
 */

export interface DeeplinkOptions {
  /** path prefix, default "cmd" (so `cmd/<id>...`) */
  prefix?: string;
}

function encodeQuery(args: ArgValues): string {
  const parts: string[] = [];
  for (const k of Object.keys(args).sort()) {
    const v = args[k];
    // a list value repeats the key: ?to=a&to=b
    for (const item of Array.isArray(v) ? v : [v]) {
      if (item !== undefined && item !== "") {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(item)}`);
      }
    }
  }
  return parts.join("&");
}

function decodeQuery(qs: string): ArgValues {
  const out: ArgValues = {};
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    if (!key) continue;
    const val = eq === -1 ? "" : decodeURIComponent(pair.slice(eq + 1));
    // a repeated key accumulates into a list
    const existing = out[key];
    if (existing === undefined) out[key] = val;
    else out[key] = Array.isArray(existing) ? [...existing, val] : [existing, val];
  }
  return out;
}

/** Serialize a path to a deeplink string. Evidence is never included. */
export function serializePath(path: PathSegment[], opts: DeeplinkOptions = {}): string {
  const prefix = opts.prefix ?? "cmd";
  const ids = path.map((s) => encodeURIComponent(s.id)).join("/");
  const tip = path[path.length - 1];
  const qs = tip?.args ? encodeQuery(tip.args) : "";
  const base = ids ? `${prefix}/${ids}` : prefix;
  return qs ? `${base}?${qs}` : base;
}

/** Parse a deeplink string into a path. Accepts a leading `#`, `/`, or `cmd/`. */
export function parseDeeplink(input: string, opts: DeeplinkOptions = {}): PathSegment[] {
  const prefix = opts.prefix ?? "cmd";
  const s = input.trim().replace(/^#/, "").replace(/^\/+/, "");
  const qIdx = s.indexOf("?");
  const pathPart = qIdx === -1 ? s : s.slice(0, qIdx);
  const queryPart = qIdx === -1 ? "" : s.slice(qIdx + 1);

  let ids = pathPart
    .split("/")
    .filter(Boolean)
    .map((seg) => decodeURIComponent(seg));
  if (ids[0] === prefix) ids = ids.slice(1);
  if (ids.length === 0) return [];

  const args = decodeQuery(queryPart);
  const hasArgs = Object.keys(args).length > 0;
  return ids.map((id, i) => (i === ids.length - 1 && hasArgs ? { id, args } : { id }));
}
