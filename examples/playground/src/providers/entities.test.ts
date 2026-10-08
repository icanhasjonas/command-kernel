import { describe, expect, it } from "bun:test";
import { kernel } from "../demo/kernel";

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
    expect(r.kind === "args" && r.errors[0]?.message).toBe('no person matches "nobody@nowhere.com"');
  });

  it("a re-sync of a submission that does not exist is an arg error", async () => {
    const r = await run("subs.resync", { submissionId: "banana" });
    expect(r.kind === "args" && r.errors[0]?.message).toBe('no submission matches "banana"');
  });

  it("Send email still takes any address: its `to` is open", async () => {
    const r = await run("email.send", { to: "grace@navy.mil", subject: "Reminder", body: "hi" });
    expect(r.kind).toBe("result");
  });
});
