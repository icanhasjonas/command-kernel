import type { ArgValues, CommandNode } from "../kernel/types";
import { navCommands, sendEmail } from "../providers/misc";
import { resendHere } from "../providers/submissions";

/**
 * The agent adapter. It projects the SAME command nodes the palette uses into a
 * flat tool list and does a toy "which tool, what args" pick. A real adapter
 * would hand these to an LLM as tool schemas; the point here is that execution
 * still flows through the identical kernel + gate — no second code path.
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

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const SUB = /sub_\d+/i;

export interface ToolPick {
  node: CommandNode;
  values: ArgValues;
}

export function pickTool(goal: string): ToolPick | null {
  const g = goal.toLowerCase();
  let best: CommandNode | null = null;
  let bestScore = 0;
  for (const t of AGENT_TOOLS) {
    const words = [...t.title.toLowerCase().split(/\s+/), ...(t.keywords ?? [])];
    const score = words.reduce((n, w) => (w.length > 2 && g.includes(w) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best || bestScore === 0) return null;

  const email = goal.match(EMAIL)?.[0];
  const sub = goal.match(SUB)?.[0];
  const values: ArgValues = {};
  for (const a of best.args ?? []) {
    if ((a.kind === "email" || a.kind === "entity") && email) values[a.id] = email;
    if (a.id === "user" && email) values[a.id] = email;
    if (a.id === "submissionId" && sub) values[a.id] = sub;
    if (a.id === "subject" && a.enumValues?.[0]) values[a.id] = a.enumValues[0].value;
    if (a.kind === "text") values[a.id] = goal;
  }
  return { node: best, values };
}
