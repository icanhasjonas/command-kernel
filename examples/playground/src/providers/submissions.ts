import { argText, type CommandNode, type CommandResult } from "@command-kernel/core";
import { type Submission, searchSubmissions } from "./data";

const toast = (message: string): Promise<CommandResult> =>
  Promise.resolve({ kind: "toast", message });

function submissionActions(s: Submission): CommandNode[] {
  return [
    {
      id: `subs.${s.id}.open`,
      title: "Open submission",
      category: s.id,
      icon: "Inbox",
      run: async () => ({
        kind: "navigate",
        message: `Opening ${s.id}`,
        payload: { module: "submissions", recordId: s.id },
      }),
    },
    {
      id: `subs.${s.id}.resend`,
      title: "Resend confirmation email",
      category: s.id,
      icon: "Send",
      gate: { confirm: true, reason: "sends a real email to the applicant" },
      run: async () => toast(`Confirmation resent for ${s.id} → ${s.email}`),
    },
    {
      id: `subs.${s.id}.resync`,
      title: "Re-sync to CRM",
      category: s.id,
      icon: "RefreshCw",
      gate: { roles: ["advisor", "admin"], confirm: true, reason: "re-enqueues the CRM push" },
      run: async () => toast(`Re-sync enqueued for ${s.id}`),
    },
  ];
}

function submissionEntity(s: Submission): CommandNode {
  return {
    id: `subs.entity.${s.id}`,
    title: s.id,
    subtitle: `${s.form} · ${s.email} · ${s.status} · ${s.when}`,
    icon: s.status === "failed" ? "AlertTriangle" : "Inbox",
    keywords: [s.form, s.email, s.status],
    resolve: async () => submissionActions(s),
  };
}

const submissionsSearch: CommandNode = {
  id: "subs.search",
  title: "Search submissions",
  summary:
    "Find submissions by id, email, or status. Enumerating runs a backend search, so pass the positional `q` first; don't list it blank.",
  category: "Submissions",
  icon: "Search",
  weight: 60,
  args: [
    {
      id: "q",
      label: "query",
      kind: "string",
      positional: true,
      placeholder: "id, email or status…",
    },
  ],
  resolve: async (a) => (await searchSubmissions(argText(a.q))).map(submissionEntity),
  run: async (a) => ({
    kind: "page",
    message: `Results page · submissions matching “${a.q ?? ""}”`,
  }),
};

export const submissionsCategory: CommandNode = {
  id: "submissions",
  title: "Submissions",
  subtitle: "search · resend · re-sync",
  summary:
    "Submitted form responses. Drill in to search by id, email, or status, then open a match, resend its confirmation email, or re-sync it to the CRM.",
  icon: "Inbox",
  weight: 66,
  resolve: async () => [submissionsSearch],
};

/**
 * Context-sensitive top-level command. Invisible everywhere EXCEPT when you are
 * looking at a submission, where it floats to the top and pre-binds the id from
 * context -the menu reacting to where you are.
 */
export const resendHere: CommandNode = {
  id: "subs.resend.here",
  title: "Resend confirmation for this submission",
  subtitle: "context-bound · the record you're viewing",
  summary:
    "Resend the confirmation email for the submission you're currently viewing (id pre-filled from context). Only appears while viewing a submission.",
  icon: "Send",
  weight: 40,
  when: (c) => c.location.module === "submissions" && Boolean(c.location.recordId),
  boost: () => 1000,
  prefill: (c) => ({ submissionId: c.location.recordId ?? "" }),
  gate: { confirm: true, reason: "sends a real email to the applicant" },
  args: [
    {
      id: "submissionId",
      label: "submission",
      kind: "entity",
      entity: { type: "submission" },
      required: true,
    },
  ],
  run: async (a) => ({ kind: "toast", message: `Confirmation resent for ${a.submissionId}` }),
};
