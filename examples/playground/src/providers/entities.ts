import type { Entity, EntityType, Piped } from "@command-kernel/core";
import {
  SUBMISSIONS,
  type Submission,
  searchSubmissions,
  searchUsers,
  USERS,
  type User,
} from "./data";

/**
 * A `person` entity type -the registered, reusable, agent-queryable catalog that
 * backs any `entity: { type: "person" }` arg. Replaces the per-arg `complete`
 * closure sendEmail used to carry. In this demo a person is identified by email
 * (so the value an arg stores doubles as the address run() sends to). Only people
 * in the directory are persons: an arg that also takes a bare address says so with
 * `open: true` (Send email), and the kernel refuses an unknown one everywhere else.
 */
const toEntity = (u: User): Entity => ({
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
    // the constraint is opaque to the kernel -the provider interprets it.
    // Person<'with-email-address'> -> only people we can actually email.
    if (opts?.constraint === "with-email-address") users = users.filter((u) => Boolean(u.email));
    const found = users.map(toEntity);
    return opts?.limit ? found.slice(0, opts.limit) : found;
  },
  async get(id) {
    const user = USERS.find((u) => u.email === id);
    return user ? toEntity(user) : null;
  },
};

/** A submission, by id: the catalog behind every `submissionId`, so "banana" is refused. */
export const submissionEntity: EntityType = {
  name: "submission",
  async search(query, _ctx, opts) {
    const found = (await searchSubmissions(query)).map(subEntity);
    return opts?.limit ? found.slice(0, opts.limit) : found;
  },
  async get(id) {
    const sub = SUBMISSIONS.find((s) => s.id === id);
    return sub ? subEntity(sub) : null;
  },
};

const subEntity = (s: Submission): Entity => ({
  id: s.id,
  label: s.id,
  hint: `${s.form} · ${s.email} · ${s.status}`,
  icon: "Inbox",
});

/** A person as a value you can hand to a command. */
export const personSubject = (u: User): Piped => ({
  type: { kind: "entity", entity: { type: "person" } },
  value: u.email,
  label: u.name,
});
