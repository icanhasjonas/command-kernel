import { declaredEffect, type EffectMode, type Gate } from "@command-kernel/core";
import type { HttpRoute } from "./define.js";

/**
 * Declarations a server refuses at construction, naming the command, instead of
 * serving them wrong at runtime.
 */

/** What the server reads from a declaration. */
export interface ServedSpec {
  readonly node: { id: string; effect?: EffectMode; gate?: Gate };
  readonly http?: HttpRoute;
}

/** A command id is one path segment on HTTP and one word in a frame: nothing else. */
const COMMAND_ID = /^[A-Za-z0-9._-]+$/;

export function checkSpecs(specs: ReadonlyArray<ServedSpec>): void {
  for (const { node, http } of specs) {
    if (!COMMAND_ID.test(node.id))
      throw new Error(
        `Command id "${node.id}" can only use letters, digits, ".", "_" and "-" (it is a URL path segment)`,
      );
    // a GET is cacheable, prefetchable and sent cross-site by a plain link: never a write
    if (http && declaredEffect(node) === "writes")
      throw new Error(
        `${node.id} writes, so it cannot have a GET route (${http.path}); it is called with POST`,
      );
  }
}
