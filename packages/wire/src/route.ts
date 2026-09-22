import type { ArgValue, ArgValues } from "@command-kernel/core";

/**
 * Resource paths for GET routes: "/boxes/:boxId/messages/:messageId".
 * `matchRoute` reads params out of a request path; `fillRoute` builds the path a
 * client calls, putting every arg the template does not name into the query.
 */

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** Params from `pathname` when it matches `template`, else null. Values are URL-decoded. */
export function matchRoute(template: string, pathname: string): Record<string, string> | null {
  const want = segments(template);
  const got = segments(pathname);
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i] as string;
    const g = got[i] as string;
    if (w.startsWith(":")) {
      let value: string;
      try {
        value = decodeURIComponent(g);
      } catch {
        return null; // a malformed escape is not this route
      }
      if (!value) return null;
      params[w.slice(1)] = value;
    } else if (w !== g) return null;
  }
  return params;
}

/** One arg value as query or path text: strings as-is, anything else as JSON. */
function text(v: ArgValue): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** The path (with query) for calling `template` with `args`. Throws if a path param is missing. */
export function fillRoute(template: string, args: ArgValues): string {
  const used = new Set<string>();
  const path = segments(template)
    .map((s) => {
      if (!s.startsWith(":")) return s;
      const name = s.slice(1);
      const v = args[name];
      if (v === undefined || v === "") throw new Error(`route ${template}: missing :${name}`);
      used.add(name);
      return encodeURIComponent(text(v));
    })
    .join("/");
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) {
    if (used.has(k) || v === undefined) continue;
    if (Array.isArray(v) && v.every((x) => typeof x !== "object")) {
      for (const item of v) query.append(k, text(item));
    } else query.append(k, text(v));
  }
  const qs = query.toString();
  return `/${path}${qs ? `?${qs}` : ""}`;
}

export interface RouteEntry<R> {
  id: string;
  route: R & { path: string };
}

/**
 * The GET routes, ordered so a literal segment beats a param (`/boxes/new` before
 * `/boxes/:id`) regardless of declaration order. Two routes that match exactly the
 * same paths (the same shape, params in the same places) are a declaration bug and
 * throw at startup instead of silently shadowing each other.
 */
export function compileRoutes<R>(entries: Array<RouteEntry<R>>) {
  const shape = (p: string) =>
    segments(p)
      .map((s) => (s.startsWith(":") ? ":" : s))
      .join("/");
  const seen = new Map<string, string>();
  for (const e of entries) {
    const key = shape(e.route.path);
    const other = seen.get(key);
    if (other)
      throw new Error(`GET routes of ${other} and ${e.id} match the same paths: ${e.route.path}`);
    seen.set(key, e.id);
  }
  // segment by segment from the left, a literal beats a param: `/boxes/new` is tried
  // before `/boxes/:id`, and `/a/:x` before `/:y/b`, whatever order they were declared in
  const rank = (a: RouteEntry<R>, b: RouteEntry<R>) => {
    const x = segments(a.route.path);
    const y = segments(b.route.path);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const xs = x[i] as string;
      const ys = y[i] as string;
      if (xs.startsWith(":") !== ys.startsWith(":")) return xs.startsWith(":") ? 1 : -1;
    }
    return 0;
  };
  const ordered = [...entries].sort(rank);
  return {
    match(pathname: string) {
      for (const e of ordered) {
        const params = matchRoute(e.route.path, pathname);
        if (params) return { id: e.id, route: e.route, params };
      }
      return null;
    },
  };
}

/**
 * Query params as args; a repeated key becomes a list. Built with fromEntries so a
 * `?__proto__=x` stays an own key instead of reaching the prototype setter.
 */
export function queryArgs(params: URLSearchParams): ArgValues {
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const all = params.getAll(key);
      return [key, all.length > 1 ? all : (all[0] ?? "")];
    }),
  );
}
