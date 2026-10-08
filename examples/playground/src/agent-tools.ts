import type { CommandNode } from "@command-kernel/core";
import { ROOTS } from "./providers/registry";

/**
 * The commands this demo hands the agent as tools. They are picked BY ID from the
 * same root list the palette, chords and deeplinks use, never re-declared: an
 * agent tool is a kernel node, so it runs through the same gate. Which tools an app
 * surfaces is an app decision; the adapter in @command-kernel/agent is generic.
 */
const TOOL_IDS = [
  "email.send",
  "users.send_reset",
  "users.impersonate",
  "subs.resync",
  "subs.resend.here",
  "crypto.encrypt",
  "go.home",
  "go.subs",
  "go.forms",
  "go.users",
];

/** The goals the agent panel offers; agent-tools.test.ts holds each to the tool it should pick. */
export const AGENT_EXAMPLES = [
  "reset the password for jon@wall.north",
  "email jane.doe@gmail.com a welcome note",
  "resync submission sub_4819 to the crm",
  "encrypt the launch date for ada@analytical.engine",
  "go to submissions",
];

export const AGENT_TOOLS: CommandNode[] = TOOL_IDS.map((id) => {
  const node = ROOTS.find((n) => n.id === id);
  if (!node) throw new Error(`agent tool ${id} is not a root command`);
  return node;
});
