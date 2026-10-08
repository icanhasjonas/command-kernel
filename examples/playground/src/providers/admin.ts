import type { CommandNode } from "@command-kernel/core";

/**
 * Flat, addressable admin actions: one node, reachable by every driver. The palette
 * finds them by search, a deeplink names them, the agent calls them as tools. Both
 * are gated, so whichever driver asks, the same gate decides.
 */

export const sendReset: CommandNode = {
  id: "users.send_reset",
  title: "Send password reset",
  subtitle: "emails a reset link · admin · confirm",
  summary:
    "Email a user a password-reset link. Admin only, and every run needs an explicit approval: the link lets the holder take over the account.",
  category: "Users",
  icon: "KeyRound",
  weight: 34,
  keywords: ["reset", "password"],
  gate: { roles: ["admin"], confirm: true, reason: "emails the user a reset link" },
  args: [{ id: "user", label: "user", kind: "email", required: true, placeholder: "their email…" }],
  run: async (a) => ({ kind: "toast", message: `Password reset sent to ${a.user}` }),
};

export const resyncSubmission: CommandNode = {
  id: "subs.resync",
  title: "Re-sync submission to CRM",
  subtitle: "re-enqueues the CRM push · advisor+ · confirm",
  summary:
    "Push one submission to the CRM again. Advisors and admins only, approved per run: it re-sends data to an external system.",
  category: "Submissions",
  icon: "RefreshCw",
  weight: 32,
  keywords: ["resync", "sync", "crm"],
  gate: { roles: ["advisor", "admin"], confirm: true, reason: "re-enqueues the CRM push" },
  args: [
    {
      id: "submissionId",
      label: "submission",
      kind: "string",
      required: true,
      placeholder: "sub_…",
    },
  ],
  run: async (a) => ({ kind: "toast", message: `Re-sync enqueued for ${a.submissionId}` }),
};
