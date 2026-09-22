import type { EffectMode, Gate } from "@command-kernel/core";
import type { HttpRoute } from "./define.js";

/**
 * Declarations a server refuses at construction, naming the command, instead of
 * serving them wrong at runtime.
 */

/** What the server reads from a declaration. */
export interface ServedSpec {
  readonly node: {
    id: string;
    effect?: EffectMode;
    gate?: Gate;
    args?: ReadonlyArray<{ id: string }>;
  };
  readonly http?: HttpRoute;
}

/**
 * A command id is one path segment on HTTP and one word in a frame: nothing else.
 * An id of only dots would be a URL's "." or ".." segment, which the URL parser
 * folds away, so it is refused too.
 */
const COMMAND_ID = /^[A-Za-z0-9._-]+$/;
const ONLY_DOTS = /^\.+$/;

export function checkSpecs(specs: ReadonlyArray<ServedSpec>): void {
  for (const { node, http } of specs) {
    if (!COMMAND_ID.test(node.id) || ONLY_DOTS.test(node.id))
      throw new Error(
        `Command id "${node.id}" can only use letters, digits, ".", "_" and "-", and not only dots (it is a URL path segment)`,
      );
    if (http) checkRoute(node, http);
  }
}

/**
 * A GET is cacheable, prefetched, and sent cross-site by a plain link or an <img>,
 * so it FAILS CLOSED: a command gets one only when its author declared, on the node,
 * that it writes nothing (`effect: "pure"`). Every path param must be a declared
 * arg, since the kernel refuses an arg the node does not declare.
 */
function checkRoute(node: ServedSpec["node"], http: HttpRoute): void {
  if (node.effect !== "pure")
    throw new Error(
      `${node.id} has a GET route (${http.path}) but does not declare effect: "pure"; a GET must never write, so declare it, or call it with POST`,
    );
  const declared = new Set((node.args ?? []).map((a) => a.id));
  for (const seg of http.path.split("/")) {
    if (seg.startsWith(":") && !declared.has(seg.slice(1)))
      throw new Error(`${node.id}: route ${http.path} names :${seg.slice(1)}, which is not an arg`);
  }
}
