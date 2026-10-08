import { argText, type CommandNode, type CommandResult } from "@command-kernel/core";
import { searchUsers, USERS, type User } from "./data";
import { personSubject } from "./entities";

const toast = (message: string): Promise<CommandResult> =>
  Promise.resolve({ kind: "toast", message });

function userActions(u: User): CommandNode[] {
  return [
    {
      id: `users.${u.id}.view`,
      title: "View profile",
      category: u.name,
      icon: "Eye",
      run: async () => ({ kind: "page", message: `Opening profile · ${u.name}` }),
    },
    {
      id: `users.${u.id}.email`,
      title: "Send email",
      category: u.name,
      icon: "Mail",
      args: [
        {
          id: "subject",
          label: "subject",
          kind: "string",
          required: true,
          placeholder: "Subject line",
        },
        {
          id: "body",
          label: "body",
          kind: "text",
          required: true,
          placeholder: "Write a message…",
        },
      ],
      run: async (a) => toast(`Email “${a.subject}” queued to ${u.email}`),
    },
    {
      id: `users.${u.id}.reset`,
      title: "Send password reset",
      category: u.name,
      icon: "KeyRound",
      gate: {
        roles: ["admin"],
        confirm: true,
        reason: "emails the user a reset link",
      },
      run: async () => toast(`Password reset sent to ${u.email}`),
    },
    {
      id: `users.${u.id}.impersonate`,
      title: "Impersonate session",
      category: u.name,
      icon: "VenetianMask",
      gate: { roles: ["admin"], confirm: true, reason: "gives full access to their account" },
      run: async () => toast(`Now impersonating ${u.name}`),
    },
    {
      id: `users.${u.id}.copy`,
      title: "Copy user id",
      category: u.name,
      icon: "Copy",
      run: async () => toast(`Copied ${u.id}`),
    },
  ];
}

function userEntity(u: User): CommandNode {
  return {
    id: `users.entity.${u.id}`,
    title: u.name,
    subtitle: `${u.email} · ${u.role} · ${u.status}`,
    icon: "User",
    keywords: [u.email, u.role, u.brand, u.status],
    subject: personSubject(u),
    resolve: async () => userActions(u),
  };
}

const usersSearch: CommandNode = {
  id: "users.search",
  title: "Search users",
  summary:
    "Find users by name or email. Enumerating runs a backend search, so pass the positional `q` first; don't list it blank.",
  category: "Users",
  icon: "Search",
  weight: 62,
  args: [
    {
      id: "q",
      label: "query",
      kind: "entity",
      positional: true,
      placeholder: "name or email…",
      complete: async (q) =>
        (await searchUsers(q)).map((u) => ({
          value: u.email,
          label: u.name,
          hint: `${u.email} · ${u.role}`,
          icon: "User",
        })),
    },
  ],
  resolve: async (a) => (await searchUsers(argText(a.q))).map(userEntity),
  run: async (a) => ({ kind: "page", message: `Results page · users matching “${a.q ?? ""}”` }),
};

export const usersCategory: CommandNode = {
  id: "users",
  title: "Users",
  subtitle: "search · reset · email · impersonate",
  summary:
    "People with portal accounts. Drill in to see them all (type to filter), then act on one: view profile, send email, send a password reset (admin), impersonate (admin), or copy id.",
  icon: "Users",
  weight: 70,
  // the people themselves, one level down; typing filters them like any list
  resolve: async () => [...USERS.map(userEntity), usersSearch],
};

/**
 * Impersonation as one flat, searchable command: "imper" finds it from the root, the
 * agent can name it, and the confirm shows exactly who (the `user` arg).
 */
export const impersonateUser: CommandNode = {
  id: "users.impersonate",
  title: "Impersonate a user",
  subtitle: "act as them · admin · confirm",
  summary:
    "Start a session as another user. Admin only, approved every time: it gives full access to their account.",
  category: "Users",
  icon: "VenetianMask",
  weight: 30,
  keywords: ["impersonate", "act as", "sudo"],
  gate: { roles: ["admin"], confirm: true, reason: "gives full access to their account" },
  args: [
    {
      id: "user",
      label: "user",
      kind: "entity",
      entity: { type: "person" },
      required: true,
      placeholder: "who…",
    },
  ],
  run: async (a) => toast(`Now impersonating ${argText(a.user)}`),
};
