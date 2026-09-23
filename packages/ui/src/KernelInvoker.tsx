import type { CommandNode, DeeplinkOptions, PathSegment } from "@command-kernel/core";
import { effectMode, serializePath } from "@command-kernel/core";
import type { ReactNode } from "react";
import { commandAttr, KERNEL_HOST_ID } from "./invokers.js";

/**
 * One kernel node, rendered as the RIGHT web primitive.
 *
 * The same addressed path serializes to one string; this component just chooses
 * the element that carries it:
 *
 * - a `<a href="#cmd/...">`         for NAVIGATION (pure / read-only nodes) -
 *     keeps link affordances (open-in-new-tab, copy, crawlable); driven by the
 *     hashchange bridge.
 * - a `<button command="--ck:...">` for ACTIONS (writing / gated nodes) -
 *     a native invoker; driven by `bindInvokers`. Not a link you'd want a crawler
 *     or a prefetch to fire.
 *
 * `as="auto"` (default) decides from `effectMode(node)`: `pure` -> link, `writes`
 * (or gated) -> button. Override with `as="link" | "button"` when you know better.
 * This is the concrete answer to "can we render links as buttons with commands?":
 * yes, but pick by intent - links go places, buttons do things.
 */
export interface KernelInvokerProps {
  /** the command node this affordance targets */
  node: CommandNode;
  /** the fully addressed path (id chain + tip args) this fires */
  path: PathSegment[];
  /** force the element; default `auto` picks from the node's effect */
  as?: "auto" | "link" | "button";
  /** `commandfor` target id for the button form (default: the shared host) */
  host?: string;
  /** deeplink prefix, shared by both forms so the two drivers decode the same string */
  deeplink?: DeeplinkOptions;
  className?: string;
  children: ReactNode;
}

/** Does this node read (link-appropriate) or write (button-appropriate)? */
function prefersLink(node: CommandNode): boolean {
  // navigable-but-not-executable (a category) or a pure run -> a link.
  return effectMode(node) !== "writes";
}

export function KernelInvoker({
  node,
  path,
  as = "auto",
  host = KERNEL_HOST_ID,
  deeplink,
  className,
  children,
}: KernelInvokerProps) {
  const useLink = as === "auto" ? prefersLink(node) : as === "link";

  if (useLink) {
    return (
      <a href={`#${serializePath(path, deeplink)}`} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      command={commandAttr(path, deeplink)}
      commandfor={host}
      className={className}
    >
      {children}
    </button>
  );
}
