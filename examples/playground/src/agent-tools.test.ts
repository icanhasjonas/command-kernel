import { expect, it } from "bun:test";
import { pickTool } from "@command-kernel/agent";
import { AGENT_EXAMPLES, AGENT_TOOLS } from "./agent-tools";
import { kernel } from "./demo/kernel";
import { fillFromNames } from "./sections/agent/understand";

const ctx = {
  location: { module: "home" },
  user: { id: "u", name: "T", role: "admin", brand: "c" },
  now: 0,
  frecency: {},
};

/** Every goal the panel offers lands on the tool it names, with nothing it would still ask for. */
const EXPECT: Record<string, string> = {
  "reset the password for jon@wall.north": "users.send_reset",
  "email jane.doe@gmail.com a welcome note": "email.send",
  "resync submission sub_4819 to the crm": "subs.resync",
  "encrypt the launch date for ada@analytical.engine": "crypto.encrypt",
  "go to submissions": "go.subs",
};

it.each(AGENT_EXAMPLES)(
  "the example %p picks its tool, and the kernel needs nothing more",
  async (goal) => {
    const pick = pickTool(goal, AGENT_TOOLS);
    expect(pick?.node.id).toBe(EXPECT[goal]);
    if (!pick) return;
    const values = await fillFromNames(goal, pick.node, pick.values, kernel.entities, ctx);
    // dry run: the walk, the args and the gate, never the command itself
    const res = await kernel.command(
      { path: [{ id: pick.node.id, args: values }], execute: true, dryRun: true },
      ctx,
    );
    expect(res.kind === "args" ? res.missing : []).toEqual([]);
    expect(["result", "gate"]).toContain(res.kind);
  },
);

it("an address fills the one person arg, never a list like attachments", () => {
  const pick = pickTool("email jane.doe@gmail.com a welcome note", AGENT_TOOLS);
  expect(pick?.values.to).toBe("jane.doe@gmail.com");
  expect(pick?.values.attachments).toBeUndefined();
});
