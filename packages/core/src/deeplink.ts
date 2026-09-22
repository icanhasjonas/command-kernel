import type { ArgSpec, ArgValues } from "./args.js";
import { setOwn } from "./own.js";
import type { PathSegment } from "./types.js";

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
  /**
   * The tip command's arg specs, when you have them. With them, a `json` arg is
   * always written as ONE JSON value, so a JSON list keeps empty strings, order and
   * text that looks like JSON. Without them, a list is written as a repeated key
   * (right for `multiple` args), which a `json` list only survives when its items
   * are plain, non-empty scalars.
   */
  args?: readonly ArgSpec[];
}

/** A URL carries text: strings as-is, numbers and booleans as their text, JSON as JSON. */
function asQueryText(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function encodeQuery(args: ArgValues, specs: readonly ArgSpec[] = []): string {
  const json = new Map(specs.filter((a) => a.kind === "json").map((a) => [a.id, a]));
  const parts: string[] = [];
  const put = (k: string, text: string) =>
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(text)}`);
  for (const k of Object.keys(args).sort()) {
    const v = args[k];
    if (v === undefined) continue;
    // a declared json arg is one JSON value, whatever it holds; a `multiple` one is
    // a repeated key, one JSON value per item
    const spec = json.get(k);
    if (spec) {
      const one = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));
      if (spec.multiple && Array.isArray(v)) for (const x of v) put(k, one(x));
      else put(k, one(v));
      continue;
    }
    // a list of scalars repeats the key: ?to=a&to=b. Anything holding an object is one
    // JSON value. A one-item list reads back as one value; coercion re-lists it for an
    // array schema or a `multiple` arg, so [7] survives the round trip.
    const items = Array.isArray(v) && v.every((x) => x === null || typeof x !== "object") ? v : [v];
    for (const item of items) {
      if (item !== null && item !== "") put(k, asQueryText(item));
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
    const existing = Object.hasOwn(out, key) ? out[key] : undefined;
    if (existing === undefined) setOwn(out, key, val);
    else setOwn(out, key, Array.isArray(existing) ? [...existing, val] : [existing, val]);
  }
  return out;
}

/** Serialize a path to a deeplink string. Evidence is never included. */
export function serializePath(path: PathSegment[], opts: DeeplinkOptions = {}): string {
  const prefix = opts.prefix ?? "cmd";
  const ids = path.map((s) => encodeURIComponent(s.id)).join("/");
  const tip = path[path.length - 1];
  const qs = tip?.args ? encodeQuery(tip.args, opts.args) : "";
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
