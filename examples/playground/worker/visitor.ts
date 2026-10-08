import { isLabRole, ROLE_HEADER, VISITOR_HEADER, VISITOR_RE } from "../src/wire/spec";
import type { Visitor } from "./lab";

/**
 * Who is calling. DEMO ONLY: the visitor names its own id and role (the page's role
 * switcher), so anyone can be admin here. A real host takes both from a sign-in it
 * verified; everything after this line is the same either way.
 */
export function visitorFrom(get: (name: string) => string | null): Visitor | null {
  const id = get(VISITOR_HEADER);
  const role = get(ROLE_HEADER);
  if (!id || !VISITOR_RE.test(id) || !isLabRole(role)) return null;
  return { id, role };
}

/** The socket URL carries the same two values (a browser cannot set headers on an upgrade). */
export function visitorFromQuery(url: URL): Visitor | null {
  return visitorFrom((name) => url.searchParams.get(name.replace(/^x-lab-/, "")));
}

/** Fixed-window rate limit per key: at most `max` calls each `windowMs`. */
export function createLimiter(max: number, windowMs: number, now = () => Date.now()) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string): boolean => {
    const t = now();
    const w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      // forget windows that ended, so the map holds only callers active this window
      for (const [k, old] of windows) if (t - old.start >= windowMs) windows.delete(k);
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= max;
  };
}
