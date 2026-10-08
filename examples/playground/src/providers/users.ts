import { argText, type CommandNode, type CommandResult } from "@command-kernel/core";
import { sendReset } from "./admin";
import { roleName, searchUsers, USERS, type User } from "./data";
import { personSubject } from "./entities";
import { sendEmail } from "./misc";

const toast = (message: string): Promise<CommandResult> =>
  Promise.resolve({ kind: "toast", message });

const userArg = {
  id: "user",
  label: "user",
  kind: "entity",
  entity: { type: "person" },
  required: true,
  placeholder: "who…",
} as const;

/** One person, as the user directory knows them. */
const byEmail = (email: string) => USERS.find((u) => u.email === email);

export const viewProfile: CommandNode = {
  id: "users.view",
  title: "View profile",
  subtitle: "a person's account page",
  summary: "Open a user's profile page. Takes the person (`user`); pipe one in.",
  category: "Users",
  icon: "Eye",
  weight: 26,
  args: [userArg],
  run: async (a) => ({
    kind: "page",
    message: `Opening profile · ${byEmail(argText(a.user))?.name}`,
  }),
};

export const copyUserId: CommandNode = {
  id: "users.copy_id",
  title: "Copy user id",
  subtitle: "for a support ticket",
  summary: "Copy a user's internal id. Takes the person (`user`); pipe one in.",
  category: "Users",
  icon: "Copy",
  weight: 20,
  args: [userArg],
  run: async (a) => toast(`Copied ${byEmail(argText(a.user))?.id}`),
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
  args: [userArg],
  run: async (a) => toast(`Now impersonating ${argText(a.user)}`),
};

/**
 * A person in the directory. It has no menu of its own: picking it hands the person to
 * whatever takes one (the pipe), so Ada offers the same commands from the root search
 * as from Users, and a command that takes a person shows up for every person.
 */
function userEntity(u: User): CommandNode {
  return {
    id: `users.entity.${u.id}`,
    title: u.name,
    subtitle: `${u.email} · ${roleName(u)} · ${u.status}`,
    icon: "User",
    keywords: [u.email, u.role, roleName(u), u.brand, u.status],
    subject: personSubject(u),
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
          hint: `${u.email} · ${roleName(u)}`,
          icon: "User",
        })),
    },
  ],
  resolve: async (a) => (await searchUsers(argText(a.q))).map(userEntity),
  run: async (a) => ({ kind: "page", message: `Results page · users matching “${a.q ?? ""}”` }),
};

/** What the Users scope holds besides its people: the commands it advertises. */
const USER_COMMANDS = [sendReset, impersonateUser, sendEmail, viewProfile, copyUserId];

export const usersCategory: CommandNode = {
  id: "users",
  title: "Users",
  subtitle: "search · reset · email · impersonate",
  summary:
    "People with portal accounts and what you can do to one. Drill in to see them all (type to filter) and the user commands: send a password reset (admin), impersonate (admin), email, view profile, copy id. Pick a person to see every command that takes them.",
  icon: "Users",
  weight: 70,
  // the people themselves and the user commands, one level down; typing filters both
  resolve: async () => [...USERS.map(userEntity), usersSearch, ...USER_COMMANDS],
};
