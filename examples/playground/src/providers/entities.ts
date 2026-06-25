import type { Entity, EntityType } from "@command-kernel/core";
import { searchUsers } from "./data";

/**
 * A `person` entity type — the registered, reusable, agent-queryable catalog that
 * backs any `entity: { type: "person" }` arg. Replaces the per-arg `complete`
 * closure sendEmail used to carry. In this demo a person is identified by email
 * (so the value an arg stores doubles as the address run() sends to).
 */
const toEntity = (u: Awaited<ReturnType<typeof searchUsers>>[number]): Entity => ({
  id: u.email,
  label: u.name,
  hint: `${u.email} · ${u.role}`,
  icon: "User",
  data: u,
});

export const personEntity: EntityType = {
  name: "person",
  async search(query, _ctx, opts) {
    let users = await searchUsers(query);
    // the constraint is opaque to the kernel — the provider interprets it.
    // Person<'with-email-address'> -> only people we can actually email.
    if (opts?.constraint === "with-email-address") users = users.filter((u) => Boolean(u.email));
    if (opts?.limit) users = users.slice(0, opts.limit);
    return users.map(toEntity);
  },
  async get(id) {
    const users = await searchUsers("");
    const found = users.find((u) => u.email === id);
    return found ? toEntity(found) : null;
  },
};
