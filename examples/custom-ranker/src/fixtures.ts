/**
 * A small shared catalog + context, used by both the demo (`index.ts`) and the
 * test. Eight sibling commands with a spread of authoring `weight`, and a `ctx`
 * whose `frecency` says the operator reaches for "Server logs" and "Send email"
 * the most. That is exactly where the two rankers disagree.
 */
import type { CommandNode, Ctx } from "@command-kernel/core";

export const NODES: CommandNode[] = [
  { id: "settings", title: "Settings", weight: 90 },
  { id: "send.email", title: "Send email", weight: 10 },
  { id: "search.files", title: "Search files", weight: 20 },
  { id: "set.reminder", title: "Set reminder", weight: 5 },
  { id: "security.audit", title: "Security audit", weight: 30 },
  { id: "select.theme", title: "Select theme", weight: 15 },
  { id: "server.logs", title: "Server logs", weight: 8 },
  // no "se" prefix — reachable only as a fuzzy subsequence (s..e in "service")
  { id: "deploy.service", title: "Deploy service", weight: 40 },
];

export function makeCtx(): Ctx {
  return {
    location: { module: "home" },
    user: { id: "u1", name: "Jonas", role: "admin", brand: "circle" },
    now: Date.now(),
    // the host learned these are the operator's go-to commands
    frecency: { "server.logs": 8, "send.email": 5 },
  };
}
