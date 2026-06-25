import type { CommandNode } from "@command-kernel/core";
import { navCommands, sendEmail } from "./providers/misc";
import { resendHere } from "./providers/submissions";

/**
 * The DEMO's agent tool set — the specific commands this example exposes to the
 * agent driver. This lives in the example, NOT in @command-kernel/agent: the
 * adapter is generic (it takes a tool list), and which tools an app surfaces is
 * an app decision. A real app would derive this from its provider registry.
 */

const resetTool: CommandNode = {
  id: "users.send_reset",
  title: "Send password reset",
  icon: "KeyRound",
  keywords: ["reset", "password"],
  gate: { roles: ["admin"], confirm: true, reason: "irreversible — emails the user a reset link" },
  args: [{ id: "user", label: "user", kind: "email", required: true }],
  run: async (a) => ({ kind: "toast", message: `Password reset sent to ${a.user}` }),
};

const resyncTool: CommandNode = {
  id: "subs.resync",
  title: "Re-sync submission to CRM",
  icon: "RefreshCw",
  keywords: ["resync", "sync", "crm"],
  gate: { roles: ["advisor", "admin"], confirm: true, reason: "re-enqueues the CRM push" },
  args: [{ id: "submissionId", label: "submission", kind: "string", required: true }],
  run: async (a) => ({ kind: "toast", message: `Re-sync enqueued for ${a.submissionId}` }),
};

export const AGENT_TOOLS: CommandNode[] = [
  sendEmail,
  resetTool,
  resyncTool,
  resendHere,
  ...navCommands,
];
