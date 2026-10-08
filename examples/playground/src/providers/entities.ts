import type { Entity, EntityType, Piped } from "@command-kernel/core";
import { searchUsers, USERS, type User } from "./data";

/**
 * A `person` entity type — the registered, reusable, agent-queryable catalog that
 * backs any `entity: { type: "person" }` arg. Replaces the per-arg `complete`
 * closure sendEmail used to carry. In this demo a person is identified by email
 * (so the value an arg stores doubles as the address run() sends to), and any
 * well-formed address is a person too: `to: j@duplo.org` works without a user.
 */
const toEntity = (u: User): Entity => ({
  id: u.email,
  label: u.name,
  hint: `${u.email} · ${u.role}`,
  icon: "User",
  data: u,
});

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** An address nobody in the directory has: still someone you can email. */
const addressEntity = (email: string): Entity => ({
  id: email,
  label: email,
  hint: "not in the directory",
  icon: "AtSign",
});

export const personEntity: EntityType = {
  name: "person",
  async search(query, _ctx, opts) {
    let users = await searchUsers(query);
    // the constraint is opaque to the kernel — the provider interprets it.
    // Person<'with-email-address'> -> only people we can actually email.
    if (opts?.constraint === "with-email-address") users = users.filter((u) => Boolean(u.email));
    const found = users.map(toEntity);
    const typed = query.trim();
    if (ADDRESS.test(typed) && !found.some((e) => e.id === typed)) found.push(addressEntity(typed));
    return opts?.limit ? found.slice(0, opts.limit) : found;
  },
  async get(id) {
    const user = USERS.find((u) => u.email === id);
    if (user) return toEntity(user);
    return ADDRESS.test(id) ? addressEntity(id) : null;
  },
};

/** A person as a value you can hand to a command. */
export const personSubject = (u: User): Piped => ({
  type: { kind: "entity", entity: { type: "person" } },
  value: u.email,
  label: u.name,
});
