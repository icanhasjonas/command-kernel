import { describe, expect, it } from "bun:test";
import { kernel, viaAgent, viaLink } from "../demo/kernel";

const ctx = {
  location: { module: "home" },
  user: { id: "u", name: "T", role: "admin", brand: "c" },
  now: 0,
  frecency: {},
};

const run = (id: string, args: Record<string, string>) =>
  kernel.command({ path: [{ id, args }], execute: true }, ctx);

describe("the schema refuses what no entity matches, before the gate", () => {
  it("a reset for someone who is not a user is an arg error, not an approval", async () => {
    const r = await run("users.send_reset", { user: "nobody@nowhere.com" });
    expect(r.kind === "args" && r.errors[0]?.message).toBe(
      'no person matches "nobody@nowhere.com"',
    );
  });

  it("a re-sync of a submission that does not exist is an arg error", async () => {
    const r = await run("subs.resync", { submissionId: "banana" });
    expect(r.kind === "args" && r.errors[0]?.message).toBe('no submission matches "banana"');
  });

  it("Send email still takes any address: its `to` is open", async () => {
    const r = await run("email.send", { to: "grace@navy.mil", subject: "Reminder", body: "hi" });
    expect(r.kind).toBe("result");
  });

  it("but not any string: an open `to` takes an address, not 'not an email'", async () => {
    const r = await run("email.send", { to: "not an email", subject: "Reminder", body: "hi" });
    expect(r.kind === "args" && r.errors[0]?.message).toBe(
      '"not an email" is not a person or an address',
    );
  });
});

describe("a link or the agent never writes on its own", () => {
  const sent = { to: "grace@navy.mil", subject: "Reminder", body: "cold" };
  it("a write reached through a link owes a confirm; the same call by hand runs", async () => {
    const linked = await kernel.command(
      { path: [{ id: "email.send", args: sent }], execute: true },
      viaLink(ctx),
    );
    expect(linked.kind === "gate" && linked.verdict.needsConfirm).toBe(true);
    const typed = await run("email.send", sent);
    expect(typed.kind).toBe("result");
  });

  it("nor does the agent: a write it chose waits for the person's OK", async () => {
    const asked = await kernel.command(
      { path: [{ id: "email.send", args: sent }], execute: true },
      viaAgent(ctx),
    );
    expect(asked.kind === "gate" && asked.verdict.needsConfirm).toBe(true);
  });

  it("a link to something that only reads still just runs", async () => {
    const r = await kernel.command({ path: [{ id: "go.subs" }], execute: true }, viaLink(ctx));
    expect(r.kind).toBe("result");
  });
});
