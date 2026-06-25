import type { CommandNode, CommandResult } from "@command-kernel/core";
import { CONNECTIONS } from "./data";

const toast = (message: string): Promise<CommandResult> =>
  Promise.resolve({ kind: "toast", message });

const nav = (module: string, label: string): CommandResult => ({
  kind: "navigate",
  message: `Navigated to ${label}`,
  payload: { module, label },
});

/** Zero-arg navigation commands — change where you are (and re-rank the menu). */
const navSummary =
  "Move the view to this area. Pure navigation — changes context only, no data is written.";
export const navCommands: CommandNode[] = [
  {
    id: "go.home",
    title: "Go to Home",
    summary: navSummary,
    category: "Navigate",
    icon: "Home",
    weight: 30,
    chord: "h",
    run: async () => nav("home", "Home"),
  },
  {
    id: "go.subs",
    title: "Go to Submissions",
    summary: navSummary,
    category: "Navigate",
    icon: "Inbox",
    weight: 44,
    chord: "s",
    run: async () => nav("submissions", "Submissions"),
  },
  {
    id: "go.forms",
    title: "Go to Forms",
    summary: navSummary,
    category: "Navigate",
    icon: "FileText",
    weight: 42,
    chord: "f",
    run: async () => nav("forms", "Forms"),
  },
  {
    id: "go.users",
    title: "Go to Users",
    summary: navSummary,
    category: "Navigate",
    icon: "Users",
    weight: 40,
    chord: "u",
    run: async () => nav("users", "Users"),
  },
  {
    id: "go.docs",
    title: "Go to Documentation",
    summary: navSummary,
    category: "Navigate",
    icon: "BookOpen",
    weight: 28,
    run: async () => nav("docs", "Documentation"),
  },
  {
    id: "go.traces",
    title: "Go to Traces",
    summary: navSummary,
    category: "Navigate",
    icon: "Activity",
    weight: 26,
    run: async () => nav("traces", "Traces"),
  },
];

/** Multi-named-arg command at the top level — the pill / completion showcase. */
export const sendEmail: CommandNode = {
  id: "email.send",
  title: "Send email",
  subtitle: "compose to anyone · 3 named args",
  summary:
    "Compose and send an email to anyone. Three named args: `to` (recipient, async lookup), `subject` (closed enum), `body` (free text). Sends a real email when run.",
  category: "Actions",
  icon: "Mail",
  weight: 48,
  chord: "e",
  args: [
    {
      id: "to",
      label: "to",
      kind: "entity",
      required: true,
      placeholder: "recipient…",
      // typed entity ref -> the registered `person` catalog is the completion
      // source (and is agent-queryable). Person<'with-email-address'>.
      entity: { type: "person", constraint: "with-email-address" },
    },
    {
      id: "subject",
      label: "subject",
      kind: "enum",
      required: true,
      enumValues: [
        { value: "Welcome to Circle", label: "Welcome to Circle" },
        { value: "Your application update", label: "Your application update" },
        { value: "Next steps", label: "Next steps" },
        { value: "Reminder", label: "Reminder" },
      ],
    },
    { id: "body", label: "body", kind: "text", required: true, placeholder: "Write a message…" },
  ],
  run: async (a) => toast(`Email “${a.subject}” queued to ${a.to}`),
};

export const connectionsCategory: CommandNode = {
  id: "connections",
  title: "Connections",
  subtitle: "CRM drivers · re-sync · schema",
  summary:
    "CRM connections (sync drivers like SugarCRM). Drill in to list each connection, then browse its schema or re-sync it (admin).",
  icon: "Plug",
  weight: 50,
  resolve: async () =>
    CONNECTIONS.map((c) => ({
      id: `conn.entity.${c.id}`,
      title: c.name,
      subtitle: `${c.driver} · ${c.live ? "live" : "stub"}`,
      icon: c.live ? "Plug" : "PlugZap",
      keywords: [c.driver, c.live ? "live" : "stub"],
      resolve: async () =>
        [
          {
            id: `conn.${c.id}.schema`,
            title: "Browse schema",
            category: c.name,
            icon: "Table2",
            run: async () => ({ kind: "page", message: `Schema · ${c.name}` }),
          },
          {
            id: `conn.${c.id}.resync`,
            title: "Re-sync connection",
            category: c.name,
            icon: "RefreshCw",
            gate: { roles: ["admin"], confirm: true, reason: "re-pulls module metadata" },
            run: async () => toast(`Re-syncing ${c.name}`),
          },
        ] satisfies CommandNode[],
    })),
};

export const toggleTheme: CommandNode = {
  id: "ui.theme",
  title: "Toggle backdrop density",
  summary: "Flip the UI backdrop density. A local view preference — no data is written.",
  category: "Actions",
  icon: "SunMoon",
  weight: 12,
  run: async () => ({ kind: "toast", message: "Toggled backdrop", payload: { toggle: "density" } }),
};
