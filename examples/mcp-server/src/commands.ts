/**
 * A tiny demo command tree for the MCP bridge — a mock "project console".
 *
 * It exists only to give the bridge something real to project: a navigation
 * parent, a search command with a required arg, a couple of plain actions, and
 * ONE gated destructive action. The point is not the app; it is that every one
 * of these reaches an MCP client through the SAME kernel + gate, unchanged.
 */
import type { CommandNode } from "@command-kernel/core";

const PROJECTS = [
  { id: "web", name: "web-app" },
  { id: "api", name: "api-gateway" },
  { id: "infra", name: "terraform-infra" },
];

export const roots: CommandNode[] = [
  // NAVIGATION — a parent node with children. `resolve` makes it navigable;
  // an agent drills in with the `resolve` tool, a human with the palette.
  {
    id: "projects",
    title: "Projects",
    summary: "Browse the projects in this workspace. Drill in to see each one.",
    resolve: async () =>
      PROJECTS.map((p) => ({
        id: `projects.${p.id}`,
        title: p.name,
        category: "projects",
        summary: `Open the ${p.name} project.`,
        run: async () => ({ kind: "navigate", message: `Opened ${p.name}` }),
      })),
  },

  // SEARCH — a command with a required positional arg. `run` makes it runnable.
  {
    id: "issues.search",
    title: "Search issues",
    summary: "Search open issues by text. Returns matching issue ids and titles.",
    args: [{ id: "query", label: "query", kind: "string", required: true, positional: true }],
    run: async ({ query }) => {
      const q = String(query);
      const hits = [
        { id: "ISS-14", title: `flaky test mentioning "${q}"` },
        { id: "ISS-27", title: `docs gap around ${q}` },
      ];
      return { kind: "page", message: `Found ${hits.length} issues`, payload: hits };
    },
  },

  // PLAIN ACTION — ungated, zero-arg. Safe to run for discovery ("pure").
  {
    id: "health.ping",
    title: "Ping",
    summary: "Health check — returns pong and the current server time.",
    run: async () => ({ kind: "toast", message: `pong @ ${new Date().toISOString()}` }),
  },

  // PLAIN ACTION — ungated, with an arg. Notifies the team channel.
  {
    id: "team.notify",
    title: "Notify team",
    summary: "Post a short message to the team channel.",
    args: [{ id: "message", label: "message", kind: "text", required: true }],
    run: async ({ message }) => ({ kind: "toast", message: `Posted: ${String(message)}` }),
  },

  // GATED DESTRUCTIVE — `confirm: true` means a human must approve out of band.
  // The projection NEVER mints that grant, so an agent hitting this always gets a
  // `gate` back; it cannot self-approve and it cannot execute.
  {
    id: "issues.close",
    title: "Close issue",
    summary: "Close an issue permanently. Requires human confirmation.",
    gate: { confirm: true, reason: "irreversible — closes the issue for everyone" },
    args: [{ id: "issueId", label: "issue id", kind: "string", required: true }],
    run: async ({ issueId }) => ({ kind: "toast", message: `Closed ${String(issueId)}` }),
  },
];
